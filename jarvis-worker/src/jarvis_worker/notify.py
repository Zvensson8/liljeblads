"""Optional email summary after ingest (Resend HTTP API)."""

from __future__ import annotations

from typing import Any

import httpx

from jarvis_worker.config import Settings


def resolve_notify_email(settings: Settings, client: Any | None = None) -> str | None:
    """Prefer env override; else email of API key owner (logged-in user who created the key)."""
    if settings.notify_email and settings.notify_email.strip():
        # Explicit env still wins if set; empty string means "use API user"
        if settings.notify_email.strip().lower() not in {"auto", "api_user", "user"}:
            return settings.notify_email.strip()
    if client is None:
        return None
    try:
        data = client._post({"type": "get_notify_email"})
        email = (data or {}).get("email")
        return email if email else None
    except Exception as exc:  # noqa: BLE001
        print(f"[notify] could not resolve API user email: {exc}")
        return None


def send_ingest_summary(
    settings: Settings,
    *,
    stats: dict[str, Any],
    results: list[dict[str, Any]],
    client: Any | None = None,
) -> dict[str, Any] | None:
    """
    Email summary only when something was actually processed.
    Empty 08:00/15:00 folder checks stay silent.
    """
    files_done = stats.get("files_done") or 0
    wo = stats.get("work_orders_created") or 0
    sug = stats.get("suggestions_created") or 0
    svc = stats.get("services_logged") or 0
    failed = stats.get("files_failed") or 0
    new_files = stats.get("new_files") or 0
    mode = stats.get("mode") or ""

    if files_done == 0 and failed == 0 and new_files == 0:
        print("[notify] skipped (nothing processed — empty folder check)")
        return None

    to_email = resolve_notify_email(settings, client)
    if not settings.resend_api_key or not to_email:
        if not settings.resend_api_key:
            print("[notify] skipped (RESEND_API_KEY missing)")
        elif not to_email:
            print("[notify] no recipient (set NOTIFY_EMAIL=auto and ensure API key has created_by)")
        return None

    lines = [
        f"Jarvis ingest klar ({mode or 'live'}).",
        f"Filer: {files_done} · Service: {svc} · Arbetsordrar: {wo} · Förslag(HITL): {sug} · Fel: {failed}",
        "",
    ]
    for r in results[:20]:
        status = "OK" if r.get("ok") else "FEL"
        name = r.get("filename") or r.get("file_id")
        summary = r.get("summary") or {}
        lines.append(
            f"- [{status}] {name} · prop={summary.get('property_name') or '-'} "
            f"· WO={summary.get('work_orders', 0)} · förslag={summary.get('suggestions', 0)} "
            f"· komponent={summary.get('matched_component_name') or '-'}"
        )
        if r.get("error"):
            lines.append(f"  fel: {r['error'][:200]}")

    body_text = "\n".join(lines)
    subj_bits = []
    if wo:
        subj_bits.append(f"{wo} WO")
    if sug:
        subj_bits.append(f"{sug} förslag")
    if svc:
        subj_bits.append(f"{svc} service")
    subj_core = ", ".join(subj_bits) if subj_bits else "ingest"
    payload = {
        "from": settings.resend_from,
        "to": [to_email],
        "subject": f"Jarvis: {subj_core} ({files_done} filer)",
        "text": body_text,
    }
    with httpx.Client(timeout=30.0) as client:
        resp = client.post(
            "https://api.resend.com/emails",
            headers={
                "Authorization": f"Bearer {settings.resend_api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
        )
        try:
            data = resp.json()
        except Exception:
            data = {"raw": resp.text}
        if resp.status_code >= 400:
            print(f"[notify] Resend error {resp.status_code}: {data}")
            return None
        return data
