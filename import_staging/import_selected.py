"""
Selective import from old Liljeblads backup into current Supabase project.
Imports: properties, floors (dep), components, projects, work_orders.
Maps organization_id + owner_id/created_by to current workspace.
"""
from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

STAGING = Path(__file__).resolve().parent
PROJECT_REF = "ojiswgqntenvbwtopxbu"
TARGET_ORG = "f9fcaf8a-3eef-4b79-a5f5-ada9c83334b9"
TARGET_USER = "6064aeb2-2303-40ba-aef8-f5182ec2d413"
TOKEN = os.environ.get("SUPABASE_ACCESS_TOKEN", "")

API = f"https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query"


def sql(query: str) -> object:
    if not TOKEN:
        raise SystemExit("Set SUPABASE_ACCESS_TOKEN")
    body = json.dumps({"query": query}).encode("utf-8")
    req = urllib.request.Request(
        API,
        data=body,
        headers={
            "Authorization": f"Bearer {TOKEN}",
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) LiljebladsImport/1.0",
            "Accept": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        err = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"SQL HTTP {e.code}: {err[:800]}") from e


def esc(val) -> str:
    if val is None:
        return "NULL"
    if isinstance(val, bool):
        return "TRUE" if val else "FALSE"
    if isinstance(val, (int, float)) and not isinstance(val, bool):
        return str(val)
    if isinstance(val, list):
        # postgres text[]
        inner = ",".join("'" + str(x).replace("'", "''") + "'" for x in val)
        return f"ARRAY[{inner}]::text[]"
    s = str(val).replace("'", "''")
    return f"'{s}'"


def load(name: str) -> list[dict]:
    raw = (STAGING / f"{name}.json").read_text(encoding="utf-8")
    data = json.loads(raw)
    return data if isinstance(data, list) else []


def batch_exec(statements: list[str], label: str, size: int = 25) -> None:
    total = len(statements)
    for i in range(0, total, size):
        chunk = statements[i : i + size]
        q = ";\n".join(chunk) + ";"
        try:
            sql(q)
        except Exception as e:
            # retry row by row
            print(f"  batch fail {label} {i}-{i+len(chunk)}: {e}")
            for j, stmt in enumerate(chunk):
                try:
                    sql(stmt + ";")
                except Exception as e2:
                    print(f"    ROW FAIL {label}[{i+j}]: {e2}")
        print(f"  {label}: {min(i+size, total)}/{total}")
        time.sleep(0.15)


def main() -> int:
    props = load("properties")
    floors = load("floors")
    comps = load("components")
    projects = load("projects")
    orders = load("work_orders")

    print(
        f"Loaded: properties={len(props)} floors={len(floors)} "
        f"components={len(comps)} projects={len(projects)} work_orders={len(orders)}"
    )

    # Disable embedding / limit triggers via session not possible on remote easily.
    # Bump org limits first
    sql(
        f"""
        UPDATE public.organizations
        SET max_properties = GREATEST(COALESCE(max_properties,0), 5000),
            max_users = GREATEST(COALESCE(max_users,0), 250)
        WHERE id = '{TARGET_ORG}';
        """
    )

    prop_stmts = []
    for p in props:
        prop_stmts.append(
            f"""
INSERT INTO public.properties (
  id, name, address, description, owner_id, created_at, updated_at,
  area_sqm, construction_year, property_type, loa, property_number,
  invoice_address, organization_id
) VALUES (
  {esc(p.get('id'))}, {esc(p.get('name'))}, {esc(p.get('address'))},
  {esc(p.get('description'))}, {esc(TARGET_USER)}, {esc(p.get('created_at'))},
  {esc(p.get('updated_at'))}, {esc(p.get('area_sqm'))},
  {esc(p.get('construction_year'))}, {esc(p.get('property_type'))},
  {esc(p.get('loa'))}, {esc(p.get('property_number'))},
  {esc(p.get('invoice_address'))}, {esc(TARGET_ORG)}
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  address = EXCLUDED.address,
  description = EXCLUDED.description,
  area_sqm = EXCLUDED.area_sqm,
  construction_year = EXCLUDED.construction_year,
  property_type = EXCLUDED.property_type,
  loa = EXCLUDED.loa,
  property_number = EXCLUDED.property_number,
  invoice_address = EXCLUDED.invoice_address,
  organization_id = EXCLUDED.organization_id,
  owner_id = EXCLUDED.owner_id,
  updated_at = EXCLUDED.updated_at
""".strip()
        )
    print("Importing properties...")
    batch_exec(prop_stmts, "properties")

    floor_stmts = []
    for f in floors:
        floor_stmts.append(
            f"""
INSERT INTO public.floors (
  id, property_id, name, level, drawing_url, created_at, updated_at
) VALUES (
  {esc(f.get('id'))}, {esc(f.get('property_id'))}, {esc(f.get('name'))},
  {esc(f.get('level'))}, {esc(f.get('drawing_url'))},
  {esc(f.get('created_at'))}, {esc(f.get('updated_at'))}
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  level = EXCLUDED.level,
  drawing_url = EXCLUDED.drawing_url,
  property_id = EXCLUDED.property_id,
  updated_at = EXCLUDED.updated_at
""".strip()
        )
    print("Importing floors (dependency for some components)...")
    batch_exec(floor_stmts, "floors")

    # Valid floor ids
    floor_ids = {f.get("id") for f in floors}

    comp_stmts = []
    for c in comps:
        floor_id = c.get("floor_id") if c.get("floor_id") in floor_ids else None
        # type/status are enums — cast as text then enum
        ctype = c.get("type") or "SC1"
        cstatus = c.get("status") or "active"
        comp_stmts.append(
            f"""
INSERT INTO public.components (
  id, floor_id, name, type, aff_code, status, room_zone, priority, supplier,
  next_service_date, notes, created_at, updated_at, registration_number,
  installation_year, manufacturer, model, serial_number, refrigerant_code,
  refrigerant_amount_kg, refrigerant_type, property_id, cost_center
) VALUES (
  {esc(c.get('id'))}, {esc(floor_id)}, {esc(c.get('name'))},
  {esc(ctype)}::component_type, {esc(c.get('aff_code'))},
  {esc(cstatus)}::component_status, {esc(c.get('room_zone'))},
  {esc(c.get('priority'))}, {esc(c.get('supplier'))},
  {esc(c.get('next_service_date'))}, {esc(c.get('notes'))},
  {esc(c.get('created_at'))}, {esc(c.get('updated_at'))},
  {esc(c.get('registration_number'))}, {esc(c.get('installation_year'))},
  {esc(c.get('manufacturer'))}, {esc(c.get('model'))},
  {esc(c.get('serial_number'))}, {esc(c.get('refrigerant_code'))},
  {esc(c.get('refrigerant_amount_kg'))}, {esc(c.get('refrigerant_type'))},
  {esc(c.get('property_id'))}, {esc(c.get('cost_center'))}
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  type = EXCLUDED.type,
  status = EXCLUDED.status,
  floor_id = EXCLUDED.floor_id,
  property_id = EXCLUDED.property_id,
  serial_number = EXCLUDED.serial_number,
  manufacturer = EXCLUDED.manufacturer,
  model = EXCLUDED.model,
  registration_number = EXCLUDED.registration_number,
  installation_year = EXCLUDED.installation_year,
  notes = EXCLUDED.notes,
  updated_at = EXCLUDED.updated_at
""".strip()
        )
    print("Importing components...")
    batch_exec(comp_stmts, "components", size=15)

    proj_stmts = []
    for p in projects:
        ptype = p.get("type") or "underhall"
        pstatus = p.get("status") or "planerat"
        proj_stmts.append(
            f"""
INSERT INTO public.projects (
  id, property_id, project_number, name, description, type, status,
  project_manager, actors, start_date, end_date, budget, forecast, actual_cost,
  is_archived, created_at, updated_at, created_by, year, start_quarter, end_quarter
) VALUES (
  {esc(p.get('id'))}, {esc(p.get('property_id'))}, {esc(p.get('project_number'))},
  {esc(p.get('name'))}, {esc(p.get('description'))},
  {esc(ptype)}::project_type, {esc(pstatus)}::project_status,
  {esc(p.get('project_manager'))}, {esc(p.get('actors'))},
  {esc(p.get('start_date'))}, {esc(p.get('end_date'))},
  {esc(p.get('budget'))}, {esc(p.get('forecast'))}, {esc(p.get('actual_cost'))},
  {esc(p.get('is_archived'))}, {esc(p.get('created_at'))}, {esc(p.get('updated_at'))},
  {esc(TARGET_USER)}, {esc(p.get('year'))},
  {esc(p.get('start_quarter'))}, {esc(p.get('end_quarter'))}
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  status = EXCLUDED.status,
  type = EXCLUDED.type,
  budget = EXCLUDED.budget,
  forecast = EXCLUDED.forecast,
  actual_cost = EXCLUDED.actual_cost,
  is_archived = EXCLUDED.is_archived,
  updated_at = EXCLUDED.updated_at
""".strip()
        )
    print("Importing projects...")
    batch_exec(proj_stmts, "projects", size=15)

    # component ids for FK null-safe
    comp_ids = {c.get("id") for c in comps}
    proj_ids = {p.get("id") for p in projects}

    wo_stmts = []
    for w in orders:
        cid = w.get("component_id") if w.get("component_id") in comp_ids else None
        pid = w.get("project_id") if w.get("project_id") in proj_ids else None
        wstatus = w.get("status") or "not_started"
        wprio = w.get("priority") or "medium"
        wo_stmts.append(
            f"""
INSERT INTO public.work_orders (
  id, property_id, action, status, priority, price, contractor, due_date,
  quarter, comments, created_at, updated_at, reminder_enabled, reminder_frequency,
  last_reminder_sent, reminder_recipient_email, project_id, component_id
) VALUES (
  {esc(w.get('id'))}, {esc(w.get('property_id'))}, {esc(w.get('action'))},
  {esc(wstatus)}::work_order_status, {esc(wprio)}::work_order_priority,
  {esc(w.get('price'))}, {esc(w.get('contractor'))}, {esc(w.get('due_date'))},
  {esc(w.get('quarter'))}, {esc(w.get('comments'))},
  {esc(w.get('created_at'))}, {esc(w.get('updated_at'))},
  {esc(w.get('reminder_enabled'))}, {esc(w.get('reminder_frequency') or 'weekly')},
  {esc(w.get('last_reminder_sent'))}, {esc(w.get('reminder_recipient_email'))},
  {esc(pid)}, {esc(cid)}
)
ON CONFLICT (id) DO UPDATE SET
  action = EXCLUDED.action,
  status = EXCLUDED.status,
  priority = EXCLUDED.priority,
  price = EXCLUDED.price,
  contractor = EXCLUDED.contractor,
  due_date = EXCLUDED.due_date,
  comments = EXCLUDED.comments,
  project_id = EXCLUDED.project_id,
  component_id = EXCLUDED.component_id,
  updated_at = EXCLUDED.updated_at
""".strip()
        )
    print("Importing work_orders...")
    batch_exec(wo_stmts, "work_orders", size=15)

    print("\n=== VERIFY ===")
    print(
        sql(
            f"""
SELECT 'properties' t, count(*)::int c FROM properties WHERE organization_id = '{TARGET_ORG}'
UNION ALL SELECT 'components', count(*)::int FROM components c
  JOIN properties p ON p.id = c.property_id WHERE p.organization_id = '{TARGET_ORG}'
UNION ALL SELECT 'projects', count(*)::int FROM projects pr
  JOIN properties p ON p.id = pr.property_id WHERE p.organization_id = '{TARGET_ORG}'
UNION ALL SELECT 'work_orders', count(*)::int FROM work_orders w
  JOIN properties p ON p.id = w.property_id WHERE p.organization_id = '{TARGET_ORG}';
"""
        )
    )
    print("Done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
