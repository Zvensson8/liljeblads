"""Restore production LA1 components accidentally bulk-deleted; only remove true orphans."""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from pathlib import Path

STAGING = Path(__file__).resolve().parent
PROJECT_REF = "ojiswgqntenvbwtopxbu"
API = f"https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query"
TOKEN = os.environ.get("SUPABASE_ACCESS_TOKEN", "")

DELETED_IDS = [
    "8f6c471e-205f-4b5f-867f-59b54ab0635e",
    "cf76b663-a540-48e5-ba08-929f3121066e",
    "7d14c5b3-5b2b-42e4-878c-0e63c82e5763",
    "394a4c9d-4f2d-493f-80de-868ca448aef9",
    "18b1a208-4957-4837-a88d-6fcef2cd2d15",
    "99466b46-cf3f-4147-aab5-c87c6447a209",
    "d7267468-5259-42d6-8dcf-a11444984dda",
    "66a3fbbb-3938-40cf-806b-0ebf4fa243f9",
    "f7846d2e-aa2e-4a6d-b921-4b1545a360bd",
    "15eadd29-cd57-44cf-8fea-d64a60bee627",
]


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
            "User-Agent": "Mozilla/5.0 LiljebladsRestore/1.0",
            "Accept": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raise RuntimeError(e.read().decode("utf-8", errors="replace")[:1000]) from e


def esc(val) -> str:
    if val is None:
        return "NULL"
    if isinstance(val, bool):
        return "TRUE" if val else "FALSE"
    if isinstance(val, (int, float)) and not isinstance(val, bool):
        return str(val)
    s = str(val).replace("'", "''")
    return f"'{s}'"


def main() -> int:
    comps = json.loads((STAGING / "components.json").read_text(encoding="utf-8"))
    by = {c["id"]: c for c in comps}
    floors = json.loads((STAGING / "floors.json").read_text(encoding="utf-8"))
    floor_ids = {f["id"] for f in floors}

    restored = 0
    for cid in DELETED_IDS:
        c = by.get(cid)
        if not c:
            print("NOT IN STAGING", cid)
            continue
        floor_id = c.get("floor_id") if c.get("floor_id") in floor_ids else None
        ctype = c.get("type") or "SC1"
        cstatus = c.get("status") or "active"
        q = f"""
INSERT INTO public.components (
  id, floor_id, name, type, aff_code, status, room_zone, priority, supplier,
  next_service_date, notes, created_at, updated_at, registration_number,
  installation_year, manufacturer, model, serial_number, refrigerant_code,
  refrigerant_amount_kg, refrigerant_type, property_id, cost_center
) VALUES (
  {esc(c.get("id"))}, {esc(floor_id)}, {esc(c.get("name"))},
  {esc(ctype)}::component_type, {esc(c.get("aff_code"))},
  {esc(cstatus)}::component_status, {esc(c.get("room_zone"))},
  {esc(c.get("priority"))}, {esc(c.get("supplier"))},
  {esc(c.get("next_service_date"))}, {esc(c.get("notes"))},
  {esc(c.get("created_at"))}, {esc(c.get("updated_at"))},
  {esc(c.get("registration_number"))}, {esc(c.get("installation_year"))},
  {esc(c.get("manufacturer"))}, {esc(c.get("model"))},
  {esc(c.get("serial_number"))}, {esc(c.get("refrigerant_code"))},
  {esc(c.get("refrigerant_amount_kg"))}, {esc(c.get("refrigerant_type"))},
  {esc(c.get("property_id"))}, {esc(c.get("cost_center"))}
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  property_id = EXCLUDED.property_id,
  registration_number = EXCLUDED.registration_number,
  status = EXCLUDED.status,
  notes = EXCLUDED.notes
"""
        try:
            sql(q)
            restored += 1
            print(
                "OK",
                c.get("name"),
                "|",
                c.get("registration_number"),
                "| prop",
                c.get("property_id"),
            )
        except Exception as e:
            print("FAIL", cid, e)

    print("restored", restored)
    print(
        "component count",
        sql("SELECT count(*)::int AS c FROM components;"),
    )
    print(
        "true orphans",
        sql(
            """
            SELECT c.id, c.name, c.property_id, c.registration_number
            FROM components c
            LEFT JOIN properties p ON p.id = c.property_id
            WHERE p.id IS NULL
            LIMIT 50
            """
        ),
    )
    # Remove only LA1 test report local file + remaining processed markers
    print(
        "LA1 processed files",
        sql(
            """
            SELECT id, filename, external_file_id
            FROM agent_processed_files
            WHERE filename ILIKE '%LA1%Test%'
               OR filename ILIKE '%Testfastighet%'
               OR filename ILIKE '%Servicerapport_LA1%'
            """
        ),
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
