import json
import os
import urllib.request

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


print(
    "mh test:",
    sql(
        """
        SELECT id, component_id, action_type, notes, performed_date
        FROM maintenance_history
        WHERE notes ILIKE '%Testfastighet%'
           OR action_type ILIKE '%LA1%'
           OR action_type ILIKE '%Testfastighet%'
           OR notes ILIKE '%Servicerapport_LA1%'
        LIMIT 30
        """
    ),
)
print(
    "mh count:",
    sql("SELECT count(*)::int AS c FROM maintenance_history"),
)
print(
    "comps after jul 26:",
    sql(
        """
        SELECT id, name, property_id, created_at
        FROM components
        WHERE created_at > '2026-07-26'
        ORDER BY created_at DESC
        LIMIT 20
        """
    ),
)
