import json
import os
import urllib.request

TOKEN = os.environ["SUPABASE_ACCESS_TOKEN"]
API = "https://api.supabase.com/v1/projects/ojiswgqntenvbwtopxbu/database/query"


def sql(q: str):
    body = json.dumps({"query": q}).encode("utf-8")
    req = urllib.request.Request(
        API,
        data=body,
        headers={
            "Authorization": f"Bearer {TOKEN}",
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode("utf-8"))


print("=== properties sample ===")
for row in sql(
    """
    SELECT name, address
    FROM properties
    WHERE organization_id = 'f9fcaf8a-3eef-4b79-a5f5-ada9c83334b9'
    ORDER BY name
    LIMIT 15
    """
):
    print(f"  {row.get('name')} | {row.get('address')}")

print("=== components with åäö ===")
for row in sql(
    """
    SELECT name FROM components
    WHERE name ~ '[åäöÅÄÖé]'
    LIMIT 10
    """
):
    print(f"  {row.get('name')}")

print("=== remaining mojibake count ===")
print(
    sql(
        """
        SELECT
          (SELECT count(*)::int FROM properties WHERE name LIKE '%├%' OR address LIKE '%├%') AS props,
          (SELECT count(*)::int FROM components WHERE name LIKE '%├%' OR notes LIKE '%├%') AS comps,
          (SELECT count(*)::int FROM projects WHERE name LIKE '%├%' OR description LIKE '%├%') AS projects,
          (SELECT count(*)::int FROM work_orders WHERE action LIKE '%├%' OR comments LIKE '%├%') AS wos
        """
    )
)
