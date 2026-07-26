"""Google Drive inbox — list and download new PDFs into local inbox_dir."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import httpx

from jarvis_worker.config import Settings


def _load_service_account(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _google_access_token(settings: Settings) -> str:
    """
    Get access token for Drive.
    Prefers service account JWT; falls back to GOOGLE_DRIVE_ACCESS_TOKEN env.
    """
    if settings.google_drive_access_token:
        return settings.google_drive_access_token

    creds_path = settings.google_application_credentials
    if not creds_path or not Path(creds_path).exists():
        raise RuntimeError(
            "Drive requires GOOGLE_APPLICATION_CREDENTIALS (service account JSON) "
            "or GOOGLE_DRIVE_ACCESS_TOKEN"
        )

    try:
        from google.auth.transport.requests import Request
        from google.oauth2 import service_account
    except ImportError as exc:
        raise RuntimeError(
            "Install google-auth: pip install google-auth google-auth-httplib2"
        ) from exc

    scopes = ["https://www.googleapis.com/auth/drive.readonly"]
    creds = service_account.Credentials.from_service_account_file(
        str(creds_path), scopes=scopes
    )
    creds.refresh(Request())
    return creds.token


def list_drive_pdfs(settings: Settings) -> list[dict[str, Any]]:
    folder_id = settings.google_drive_folder_id
    if not folder_id:
        return []

    token = _google_access_token(settings)
    q = (
        f"'{folder_id}' in parents and trashed=false and "
        "(mimeType='application/pdf' or name contains '.pdf')"
    )
    files: list[dict[str, Any]] = []
    page_token = None
    with httpx.Client(timeout=60.0) as client:
        while True:
            params: dict[str, Any] = {
                "q": q,
                "fields": "nextPageToken, files(id, name, mimeType, modifiedTime)",
                "pageSize": 100,
                "supportsAllDrives": "true",
                "includeItemsFromAllDrives": "true",
            }
            if page_token:
                params["pageToken"] = page_token
            r = client.get(
                "https://www.googleapis.com/drive/v3/files",
                headers={"Authorization": f"Bearer {token}"},
                params=params,
            )
            r.raise_for_status()
            data = r.json()
            files.extend(data.get("files") or [])
            page_token = data.get("nextPageToken")
            if not page_token:
                break
    return files


def download_drive_file(settings: Settings, file_id: str, dest: Path) -> Path:
    token = _google_access_token(settings)
    dest.parent.mkdir(parents=True, exist_ok=True)
    with httpx.Client(timeout=120.0, follow_redirects=True) as client:
        r = client.get(
            f"https://www.googleapis.com/drive/v3/files/{file_id}",
            headers={"Authorization": f"Bearer {token}"},
            params={"alt": "media", "supportsAllDrives": "true"},
        )
        r.raise_for_status()
        dest.write_bytes(r.content)
    return dest


def sync_drive_to_inbox(
    settings: Settings,
    *,
    processed_ids: set[str] | None = None,
    processed_filenames: set[str] | None = None,
) -> dict[str, Any]:
    """
    Download new PDFs from Drive folder into inbox_dir.

    Skips a remote file if:
    - same name already exists under inbox/processed/failed (local)
    - same filename was already ingested (DB)
    - drive:{id} was already ingested (DB)
    """
    if not settings.google_drive_folder_id:
        return {"enabled": False, "downloaded": 0, "skipped": 0}

    settings.inbox_dir.mkdir(parents=True, exist_ok=True)
    existing_names = {
        p.name.lower() for p in settings.inbox_dir.rglob("*") if p.is_file()
    }
    done_ids = processed_ids or set()
    done_names = processed_filenames or set()

    try:
        remote = list_drive_pdfs(settings)
    except Exception as exc:  # noqa: BLE001
        return {"enabled": True, "error": str(exc), "downloaded": 0, "skipped": 0}

    downloaded = 0
    skipped = 0
    errors: list[str] = []
    downloaded_meta: list[dict[str, str]] = []

    for f in remote:
        drive_id = str(f.get("id") or "")
        name = f.get("name") or (f"{drive_id}.pdf" if drive_id else "file.pdf")
        if not name.lower().endswith(".pdf"):
            name = f"{name}.pdf"
        name_l = name.lower()
        drive_key = f"drive:{drive_id}" if drive_id else ""

        name_key = f"name:{name_l}"
        if name_l in existing_names:
            skipped += 1
            continue
        if name_l in done_names or name_key in done_ids:
            skipped += 1
            continue
        if drive_key and drive_key in done_ids:
            skipped += 1
            continue

        dest = settings.inbox_dir / name
        try:
            download_drive_file(settings, drive_id, dest)
            downloaded += 1
            existing_names.add(name_l)
            downloaded_meta.append(
                {
                    "filename": name,
                    "drive_id": drive_id,
                    "path": str(dest.resolve()),
                }
            )
        except Exception as exc:  # noqa: BLE001
            errors.append(f"{name}: {exc}")

    return {
        "enabled": True,
        "remote_files": len(remote),
        "downloaded": downloaded,
        "skipped": skipped,
        "errors": errors,
        "files": downloaded_meta,
    }
