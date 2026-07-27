# Jarvis Worker (LangGraph)

LangGraph-pipeline för **servicerapport-ingest** mot Liljeblads / Supabase, plus
CLI-chat med tools (fastigheter, komponenter, WO, **prediktiv risk**).

```text
Drive/inbox PDF
  → discover (+ Drive sync)
  → parse (pypdf)
  → extract (Gemini + heuristics)
  → match property/component
  → log_service + work_order  ELLER  HITL suggest_work_order
  → mark_processed (DB)
  → e-postsammanfattning (Resend)
```

## Setup

```powershell
cd jarvis-worker
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e .
copy .env.example .env
# LILJEBLADS_API_KEY, GOOGLE_API_KEY, ev. Drive/Resend
```

### API-nyckel i Liljeblads

Organisation → API-nycklar → `lbl_...` med minst:

- `create_work_order`, `log_service`, `list_components`, `list_properties`
- För HITL: samma + granska i **AI-förslag** / Pending actions

Webhook:

`https://ojiswgqntenvbwtopxbu.supabase.co/functions/v1/crewai-webhook`

### MODE

| MODE | Beteende |
|------|----------|
| `live` | Skapa WO + service (default produktion) |
| `hitl` | Service kan loggas; åtgärder → **pending** `ai_suggested_actions` |
| `dry_run` | Extrahera bara, inga skrivningar |

## Kör

```powershell
python -m jarvis_worker.cli ingest
python -m jarvis_worker.cli ingest --sync-drive
python -m jarvis_worker.cli ingest --dry-run

python -m jarvis_worker.cli chat
python -m jarvis_worker.cli ask "Vilka komponenter har högst risk?"
python -m jarvis_worker.cli ask "Lista öppna arbetsordrar"
```

Schema 08:00 / 15:00: `scripts/install-scheduled-tasks.ps1`

## Chat-tools (webhook)

| Tool | Webhook type |
|------|----------------|
| list_properties | `list_properties` |
| search_components | `search_components` |
| list_services | `list_services` |
| list_work_orders | `list_work_orders` |
| list_high_risk_components | `list_high_risk_components` (Weibull) |

Ingest HITL: `suggest_work_order` → pending AI-åtgärd.

## Drive & e-post

Se `docs/JARVIS.md` och `.env.example` (`DRIVE_SYNC_ENABLED`, `RESEND_API_KEY`, `NOTIFY_EMAIL=auto`).
