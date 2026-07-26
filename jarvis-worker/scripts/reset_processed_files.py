"""Reset specific service reports so Jarvis can re-ingest them."""
from __future__ import annotations

import json
import os
import shutil
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROCESSED = ROOT / "inbox" / "processed"
INBOX = ROOT / "inbox"

# The three Drive reports that ran under heuristic (Gemini quota)
FILENAMES = [
    "Hjulet 1&2- Vent och kyla - Q2.pdf",
    "Orrby 1_72- Vent - Q2.pdf",
    "Plåtslagaren 7 - Vent och kyla - Q2.pdf",
]

PROJECT_REF = "ojiswgqntenvbwtopxbu"
ORG = "f9fcaf8a-3eef-4b79-a5f5-ada9c83334b9"
API = f"https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query"
TOKEN = os.environ.get("SUPABASE_ACCESS_TOKEN", "")


def sql(query: str):
    if not TOKEN:
        raise SystemExit("Set SUPABASE_ACCESS_TOKEN")
    body = json.dumps({"query": query}).encode("utf-8")
    req = urllib.request.Request(
        API,
        data=body,
        headers={
            "Authorization": f"Bearer {TOKEN}",
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 LiljebladsReset/1.0",
            "Accept": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raise RuntimeError(e.read().decode("utf-8", errors="replace")[:800]) from e


def esc(s: str) -> str:
    return s.replace("'", "''")


def main() -> int:
    INBOX.mkdir(parents=True, exist_ok=True)

    # Move any matching local files back to inbox (handle å/a encoding variants)
    moved = []
    for path in list(PROCESSED.glob("*.pdf")):
        name = path.name
        name_l = name.lower()
        match = False
        for target in FILENAMES:
            t = target.lower()
            # loose match: startswith property name stem
            if name_l == t or name_l.replace("å", "a") == t.replace("å", "a"):
                match = True
                break
            if "hjulet" in name_l and "hjulet" in t:
                match = True
                break
            if "orrby" in name_l and "orrby" in t:
                match = True
                break
            if "pl" in name_l and "tslagaren" in name_l and "tslagaren" in t:
                match = True
                break
        if not match:
            continue
        dest = INBOX / name
        if dest.exists():
            dest.unlink()
        shutil.move(str(path), str(dest))
        moved.append(name)
        print(f"moved -> inbox: {name}")

    # Delete DB rows for these filenames (and related keys)
    like_clauses = " OR ".join(
        f"filename ILIKE '%{esc(part)}%'"
        for part in ("Hjulet 1&2", "Orrby 1_72", "Plåtslagaren 7", "Plats", "tslagaren 7")
    )
    # also drop name:/sha256:/drive: keys tied to those filenames
    q = f"""
    DELETE FROM public.agent_processed_files
    WHERE organization_id = '{ORG}'
      AND (
        {like_clauses}
        OR external_file_id LIKE 'name:hjulet%'
        OR external_file_id LIKE 'name:orrby%'
        OR external_file_id LIKE 'name:pl%'
      )
    RETURNING id, filename, external_file_id, status;
    """
    rows = sql(q)
    print(f"db deleted rows: {len(rows) if isinstance(rows, list) else rows}")
    if isinstance(rows, list):
        for r in rows[:30]:
            print(" ", r.get("filename"), r.get("external_file_id"))

    remaining = sql(
        f"""
        SELECT count(*)::int AS c
        FROM public.agent_processed_files
        WHERE organization_id = '{ORG}'
          AND (
            filename ILIKE '%Hjulet 1&2%'
            OR filename ILIKE '%Orrby 1_72%'
            OR filename ILIKE '%tslagaren 7%'
          );
        """
    )
    print("remaining matching rows:", remaining)
    print("local moved:", moved)
    print("inbox files:", [p.name for p in INBOX.glob("*.pdf")])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
