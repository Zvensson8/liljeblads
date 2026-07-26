import json
import os
import urllib.request
from pathlib import Path

TOKEN = os.environ["SUPABASE_ACCESS_TOKEN"]
API = "https://api.supabase.com/v1/projects/ojiswgqntenvbwtopxbu/database/query"


def sql(q: str):
    req = urllib.request.Request(
        API,
        data=json.dumps({"query": q}).encode(),
        headers={
            "Authorization": f"Bearer {TOKEN}",
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode())


print("properties test:")
print(sql("SELECT id, name FROM properties WHERE name ILIKE '%test%' OR name ILIKE '%LA1%';"))

print("components with serial from test pdf / notes:")
print(
    sql(
        """
        SELECT id, name, property_id, registration_number, serial_number, notes, created_at
        FROM components
        WHERE notes ILIKE '%test%'
           OR registration_number ILIKE '%G020F3SDP%'
           OR name = 'LA1' AND created_at > '2026-07-25'
        ORDER BY created_at DESC
        LIMIT 30
        """
    )
)

print("orphans (missing property):")
print(
    sql(
        """
        SELECT c.id, c.name, c.property_id, c.registration_number, c.created_at
        FROM components c
        LEFT JOIN properties p ON p.id = c.property_id
        WHERE p.id IS NULL
        """
    )
)

print("work_orders orphan property:")
print(
    sql(
        """
        SELECT w.id, w.action, w.property_id, w.component_id
        FROM work_orders w
        LEFT JOIN properties p ON p.id = w.property_id
        WHERE p.id IS NULL
        LIMIT 20
        """
    )
)

print("service history tables:")
print(
    sql(
        """
        SELECT table_name FROM information_schema.tables
        WHERE table_schema='public' AND (
          table_name ILIKE '%service%' OR table_name ILIKE '%maintenance%'
        )
        """
    )
)

# local test pdf
print("local LA1 pdf:")
root = Path(r"C:\Users\andre\Documents\liljeblads\jarvis-worker\inbox")
for p in root.rglob("*LA1*"):
    print(" ", p)
