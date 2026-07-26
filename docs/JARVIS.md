# Jarvis (LangGraph) – snabbstart

## Vad som byggts

| Del | Plats |
|-----|--------|
| LangGraph ingest pipeline | `jarvis-worker/` |
| DB: `agent_processed_files`, `agent_runs` | migration `20260726090000_jarvis_agent_tables.sql` |
| Webhook-API för agent | `crewai-webhook` types: `list_properties`, `list_processed_files`, `mark_processed`, `start_agent_run`, `finish_agent_run` + befintliga WO/service |

## Flöde

```text
inbox/*.pdf → parse → Gemini extract → match fastighet/komponent
  → log_service + work_order (not_started)
  → agent_processed_files
```

## Din checklista

1. **Migration + webhook** (redan pushade om CLI lyckades; annars:)
   ```powershell
   cd C:\Users\andre\Documents\liljeblads
   npx supabase db push
   npx supabase functions deploy crewai-webhook
   ```

2. **API-nyckel** i appen: Organisation → API-nycklar  
   Permissions: `create_work_order`, `log_service`, `read_components`

3. **Worker env**
   ```powershell
   cd jarvis-worker
   copy .env.example .env
   # LILJEBLADS_API_KEY=lbl_...
   # GOOGLE_API_KEY=AIza...  (samma som GOOGLE_AI_API_KEY)
   ```

4. **Installera & kör**
   ```powershell
   python -m venv .venv
   .\.venv\Scripts\Activate.ps1
   pip install -e .
   # Lägg PDF i inbox\
   python -m jarvis_worker.cli ingest
   ```

5. Kontrollera i Liljeblads: Arbetsordrar + servicehistorik på komponent.

## Designval

- **LangGraph** (inte CrewAI) som runtime  
- CrewAI-zip = kravspec för extraktion/matchning  
- Lokal **inbox-mapp** v1 (Drive senare)  
- Auto-WO + auto-service default (`AUTO_*=true`); sätt `MODE=dry_run` för test  

## Arbetsordrar & kostnad

- WO skapas som `not_started` med `component_id` → syns under komponent → **Arbetsordrar**.
- Föreslagen kostnad: `work_orders.price`.
- När status sätts till **Slutförd** i appen:
  1. Dialog för slutkostnad (förifylld med föreslaget pris)
  2. `maintenance_history` på komponenten med kostnaden
  3. `price` uppdateras till slutkostnad om du anger en

## Schema (Windows) – 08:00 och 15:00

```powershell
cd C:\Users\andre\Documents\liljeblads\jarvis-worker
powershell -ExecutionPolicy Bypass -File .\scripts\install-scheduled-tasks.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\run-ingest.ps1
```

Loggar: `jarvis-worker/logs/`

## Google Drive (steg 2)

```env
DRIVE_SYNC_ENABLED=true
GOOGLE_DRIVE_FOLDER_ID=...
GOOGLE_APPLICATION_CREDENTIALS=C:\path\to\service-account.json
```

Dela Drive-mappen med service account-e-posten. Kör:

```powershell
python -m jarvis_worker.cli ingest --sync-drive
```

## Chat Jarvis v0 (steg 3)

```powershell
python -m jarvis_worker.cli chat
python -m jarvis_worker.cli ask "Lista mina fastigheter"
python -m jarvis_worker.cli ask "Sök komponent SN-TEST-001"
```

Kräver fungerande `GOOGLE_API_KEY` (Gemini) för språk; tools går mot Liljeblads webhook.

## E-postnotis efter ingest

```env
RESEND_API_KEY=re_...
NOTIFY_EMAIL=du@foretag.se
```

## Runbook

Se `docs/PRODUCTION_RUNBOOK.md`.
