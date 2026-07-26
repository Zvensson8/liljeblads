# Jarvis Worker (LangGraph)

LangGraph-pipeline för **servicerapport-ingest** mot Liljeblads / Supabase.

```text
INBOX PDF/txt
  → discover
  → parse (pypdf)
  → extract (Gemini)
  → match property/component
  → log_service + work_order (webhook)
  → mark_processed (DB)
```

## Setup

```powershell
cd C:\Users\andre\Documents\liljeblads\jarvis-worker
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e .

copy .env.example .env
# Fyll i LILJEBLADS_API_KEY, GOOGLE_API_KEY
```

### API-nyckel i Liljeblads

1. Logga in som founder/admin  
2. Organisation → API-nycklar  
3. Skapa nyckel `lbl_...` med behörigheter:  
   `create_work_order`, `log_service`, `read_components`  
4. Klistra in i `.env` som `LILJEBLADS_API_KEY`

Webhook-URL ska peka på:

`https://ojiswgqntenvbwtopxbu.supabase.co/functions/v1/crewai-webhook`

### Inbox

Lägg PDF-rapporter i `./inbox` (skapas automatiskt).  
Efter lyckad körning flyttas filer till `inbox/processed`, fel till `inbox/failed`.

## Kör

```powershell
# Riktig körning (skapar WO + service)
jarvis-ingest ingest

# Bara lista/extrahera utan skrivning till WO (kräver fortfarande API för properties)
# Sätt MODE=dry_run i .env eller:
# (dry-run markerar inte processade i DB i nuvarande version om ni vill — se graph)
```

Via modul:

```powershell
python -m jarvis_worker.cli ingest
```

## Schema (från CrewAI-spec)

Extraherar per fil:

- `property_name`, `report_date`, `supplier`
- `components_mentioned[]` (beteckning, serial_number)
- `actions[]` (action_text, component_system, priority, price_estimate, raw_context)

## Nästa steg

- Google Drive-inbox-nod (ersätter lokal mapp)
- Marker för skannade PDF  
- Human-in-the-loop (utkast till `ai_suggested_actions` i stället för auto-WO)
- Chat-orchestrator (LangGraph tools) i samma paket
