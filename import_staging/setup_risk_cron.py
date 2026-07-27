"""Enable pg_cron + schedule risk-suggest-actions (and embeddings poll)."""
from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.request
from pathlib import Path

PROJECT = "ojiswgqntenvbwtopxbu"
API = f"https://api.supabase.com/v1/projects/{PROJECT}/database/query"
TOKEN = os.environ.get("SUPABASE_ACCESS_TOKEN", "")
ROOT = Path(__file__).resolve().parents[1]
FN_URL = f"https://{PROJECT}.supabase.co/functions/v1"


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
            "User-Agent": "Mozilla/5.0 LiljebladsCron/1.0",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raise RuntimeError(e.read().decode("utf-8", errors="replace")[:1200]) from e


def load_cron_secret() -> str:
    env_secret = os.environ.get("CRON_SECRET", "").strip()
    if env_secret:
        return env_secret
    path = ROOT / ".secrets.local"
    if not path.exists():
        raise SystemExit("Missing .secrets.local with CRON_SECRET=...")
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.startswith("CRON_SECRET="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit("CRON_SECRET not found in .secrets.local")


def esc(s: str) -> str:
    return s.replace("'", "''")


def main() -> int:
    secret = load_cron_secret()
    print("CRON_SECRET loaded (len=%d)" % len(secret))

    print("=== extensions ===")
    try:
        print(sql("CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;"))
    except Exception as e:
        print("pg_cron:", e)
    try:
        print(sql("CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;"))
    except Exception as e:
        print("pg_net:", e)

    print(
        "installed:",
        sql(
            """
            SELECT extname, extversion FROM pg_extension
            WHERE extname IN ('pg_cron', 'pg_net')
            ORDER BY extname
            """
        ),
    )

    # Unschedule previous jobs with same names (ignore errors)
    for name in (
        "risk-suggest-actions-daily",
        "generate-embeddings-quarter-hourly",
    ):
        try:
            sql(f"SELECT cron.unschedule('{esc(name)}');")
            print(f"unscheduled {name}")
        except Exception as e:
            print(f"unschedule {name}: {e}")

    # Schedule risk suggest daily 06:00 UTC
    risk_cmd = f"""
SELECT net.http_post(
  url := '{FN_URL}/risk-suggest-actions',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'x-cron-secret', '{esc(secret)}'
  ),
  body := '{{}}'::jsonb
);
""".strip()

    emb_cmd = f"""
SELECT net.http_post(
  url := '{FN_URL}/generate-embeddings',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'x-cron-secret', '{esc(secret)}'
  ),
  body := '{{}}'::jsonb
);
""".strip()

    print("=== schedule risk-suggest ===")
    print(
        sql(
            f"""
            SELECT cron.schedule(
              'risk-suggest-actions-daily',
              '0 6 * * *',
              $cmd${risk_cmd}$cmd$
            );
            """
        )
    )

    print("=== schedule embeddings ===")
    print(
        sql(
            f"""
            SELECT cron.schedule(
              'generate-embeddings-quarter-hourly',
              '*/15 * * * *',
              $cmd${emb_cmd}$cmd$
            );
            """
        )
    )

    print("=== jobs ===")
    jobs = sql(
        """
        SELECT jobid, jobname, schedule, active,
               left(command, 120) AS command_preview
        FROM cron.job
        ORDER BY jobid
        """
    )
    # Don't print secrets if command embeds them — redact
    if isinstance(jobs, list):
        for j in jobs:
            preview = str(j.get("command_preview") or "")
            preview = re.sub(
                r"x-cron-secret',\s*'[^']*'",
                "x-cron-secret', '***'",
                preview,
            )
            print(
                j.get("jobid"),
                j.get("jobname"),
                j.get("schedule"),
                j.get("active"),
                preview,
            )
    else:
        print(jobs)

    print("Done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
