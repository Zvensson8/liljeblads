"""Find and delete LA1 / Testfastighet1 leftovers (orphaned components etc.)."""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request

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
            "User-Agent": "Mozilla/5.0 LiljebladsCleanup/1.0",
            "Accept": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raise RuntimeError(e.read().decode("utf-8", errors="replace")[:1000]) from e


def main() -> int:
    print("=== properties matching test/LA1 ===")
    props = sql(
        f"""
        SELECT id, name, organization_id
        FROM properties
        WHERE organization_id = '{ORG}'
          AND (
            name ILIKE '%testfastighet%'
            OR name ILIKE '%test fastighet%'
            OR name ILIKE '%LA1%'
            OR name ILIKE '%Testfastighet1%'
          )
        """
    )
    print(props)

    print("=== components LA1 / orphan / test ===")
    comps = sql(
        f"""
        SELECT c.id, c.name, c.property_id, c.registration_number,
               p.name AS prop_name, p.id AS prop_exists
        FROM components c
        LEFT JOIN properties p ON p.id = c.property_id
        WHERE c.name ILIKE '%LA1%'
           OR c.registration_number ILIKE '%LA1%'
           OR c.name ILIKE '%testfastighet%'
           OR (c.property_id IS NOT NULL AND p.id IS NULL)
           OR (
             p.organization_id = '{ORG}'
             AND p.name ILIKE '%testfastighet%'
           )
        LIMIT 100
        """
    )
    print(json.dumps(comps, indent=2, ensure_ascii=False, default=str))

    print("=== agent_processed LA1 ===")
    print(
        sql(
            """
            SELECT id, filename, external_file_id, status
            FROM agent_processed_files
            WHERE filename ILIKE '%LA1%' OR filename ILIKE '%Testfastighet%'
            """
        )
    )

    # Collect ids to delete
    comp_ids = [r["id"] for r in (comps or []) if r.get("id")]
    prop_ids = [r["id"] for r in (props or []) if r.get("id")]

    if not comp_ids and not prop_ids:
        print("Nothing to delete.")
        return 0

    print(f"Deleting components={len(comp_ids)} properties={len(prop_ids)}")

    if comp_ids:
        ids = ",".join(f"'{i}'" for i in comp_ids)
        # dependent rows first
        for table, col in [
            ("service_logs", "component_id"),
            ("work_orders", "component_id"),
            ("component_geometry", "component_id"),
        ]:
            try:
                r = sql(f"DELETE FROM {table} WHERE {col} IN ({ids}) RETURNING id;")
                print(f"  {table}: deleted {len(r) if isinstance(r, list) else r}")
            except Exception as e:
                print(f"  {table}: skip/err {e}")
        # null out FKs that might not cascade
        try:
            sql(f"UPDATE work_orders SET component_id = NULL WHERE component_id IN ({ids});")
        except Exception as e:
            print(f"  wo null: {e}")
        r = sql(f"DELETE FROM components WHERE id IN ({ids}) RETURNING id, name;")
        print("  components deleted:", r)

    if prop_ids:
        ids = ",".join(f"'{i}'" for i in prop_ids)
        for table, col in [
            ("work_orders", "property_id"),
            ("projects", "property_id"),
            ("floors", "property_id"),
            ("components", "property_id"),
        ]:
            try:
                r = sql(f"DELETE FROM {table} WHERE {col} IN ({ids}) RETURNING id;")
                print(f"  {table} by prop: {len(r) if isinstance(r, list) else r}")
            except Exception as e:
                print(f"  {table} by prop: {e}")
        r = sql(f"DELETE FROM properties WHERE id IN ({ids}) RETURNING id, name;")
        print("  properties deleted:", r)

    # processed file markers for LA1 test report
    r = sql(
        """
        DELETE FROM agent_processed_files
        WHERE filename ILIKE '%LA1%' OR filename ILIKE '%Testfastighet%'
        RETURNING id, filename, external_file_id;
        """
    )
    print("  agent_processed deleted:", r)

    print("=== verify remaining ===")
    print(
        sql(
            """
            SELECT c.id, c.name, c.property_id
            FROM components c
            LEFT JOIN properties p ON p.id = c.property_id
            WHERE c.name ILIKE '%LA1%'
               OR (c.property_id IS NOT NULL AND p.id IS NULL)
            LIMIT 20
            """
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
