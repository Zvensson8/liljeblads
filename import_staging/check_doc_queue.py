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


print("property_documents:", sql("SELECT count(*)::int AS c FROM property_documents"))
print(
    "queue property_docs unprocessed:",
    sql(
        """
        SELECT count(*)::int AS c FROM embedding_queue
        WHERE source_table = 'property_documents' AND processed = false
        """
    ),
)
print(
    "embeddings property_docs:",
    sql(
        """
        SELECT count(*)::int AS c FROM embeddings
        WHERE source_table = 'property_documents'
        """
    ),
)
print(
    "queue sample:",
    sql(
        """
        SELECT id, source_id, operation, processed, error, created_at
        FROM embedding_queue
        WHERE source_table = 'property_documents'
        ORDER BY created_at DESC
        LIMIT 10
        """
    ),
)
