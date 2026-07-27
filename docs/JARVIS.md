# Jarvis (LangGraph) – snabbstart

## Vad som finns

| Del | Plats |
|-----|--------|
| LangGraph ingest | `jarvis-worker/` |
| Drive-sync | `drive_inbox.py` |
| Gemini extract + heuristics | `extract.py`, `heuristic_extract.py` |
| Webhook-API | `crewai-webhook` |
| DB | `agent_processed_files`, `agent_runs` |
| Prediktiv risk i chat | `list_high_risk_components` |
| HITL-ingest | `MODE=hitl` → `suggest_work_order` |
| E-postsammanfattning | Resend via `notify.py` |

## Flöde

```text
inbox/*.pdf (+ Drive)
  → parse → Gemini extract → match fastighet/komponent
  → log_service
  → work_order (live)  ELLER  suggest_work_order (hitl)
  → agent_processed_files + agent_runs
  → e-post (valfritt)
```

## Checklist

1. **Deploy webhook** (efter kodändringar):
   ```powershell
   npx supabase functions deploy crewai-webhook
   ```

2. **API-nyckel** i appen: Organisation → API-nycklar  
   Permissions: `create_work_order`, `log_service`, `list_components`, `list_properties`

3. **Worker env** (`jarvis-worker/.env`):
   ```env
   LILJEBLADS_API_KEY=lbl_...
   GOOGLE_API_KEY=...
   GEMINI_MODEL=gemini-flash-latest
   MODE=live
   # MODE=hitl  för granskningsbara WO-förslag
   # DRIVE_SYNC_ENABLED=true + folder + service account
   # RESEND_API_KEY + NOTIFY_EMAIL=auto
   ```

4. **Kör**
   ```powershell
   cd jarvis-worker
   .\.venv\Scripts\Activate.ps1
   python -m jarvis_worker.cli ingest --sync-drive
   python -m jarvis_worker.cli ask "Vilka komponenter har högst risk?"
   ```

5. Kontrollera: Arbetsordrar / AI-förslag / servicehistorik i Liljeblads.

## MODE

| Värde | WO | Service | Användning |
|-------|----|---------|------------|
| `live` | Direkt | Ja (om match) | Produktion |
| `hitl` | Pending AI | Ja (om match) | Granskning |
| `dry_run` | Nej | Nej | Test av extract |

## Webhook-typer (urval)

| type | Syfte |
|------|--------|
| `work_order` | Skapa WO |
| `suggest_work_order` | Pending HITL |
| `log_service` | maintenance_history |
| `list_properties` / `search_components` | Läs |
| `list_work_orders` | Öppna WO |
| `list_high_risk_components` | Weibull-risk |
| `list_processed_files` / `mark_processed` | Idempotens |
| `start_agent_run` / `finish_agent_run` | Körlogg |

## Schema Windows

```powershell
cd jarvis-worker
powershell -ExecutionPolicy Bypass -File .\scripts\install-scheduled-tasks.ps1
```

Loggar: `jarvis-worker/logs/`

## Designval

- **LangGraph** (inte CrewAI runtime) — pipeline i `jarvis-worker/`
- Webhook-funktionen kan heta `crewai-webhook` **eller** `jarvis-webhook` (samma kod; CrewAI-namnet är legacy-URL)
- Prediktiv risk = samma Weibull som appen (`_shared/componentRisk`)
- Auto-WO default; HITL via `MODE=hitl`
- Innehålls-hash + Drive-id för dedupe

## Full fastighets-Q&A

| Kanal | Hur |
|-------|-----|
| **App AI-chat** | Tools: `get_property_overview`, dokument-RAG, risk, WO, … |
| **Worker CLI** | Samma data via webhook-tools |

`get_property_overview` samlar: grunddata, komponenter, öppna WO/todos, anteckningar, dokumentlista, högrisk, underhållsplan.

Dokument**innehåll** kräver indexerade embeddings (`search_property_documents` / app-upload).

### Deploy (krävs efter kodändring)

```powershell
npx supabase login
npx supabase functions deploy jarvis-webhook --project-ref ojiswgqntenvbwtopxbu
npx supabase functions deploy crewai-webhook --project-ref ojiswgqntenvbwtopxbu
npx supabase functions deploy ai-chat --project-ref ojiswgqntenvbwtopxbu
```

Test:

```powershell
node scripts/test-jarvis-webhook.mjs
cd jarvis-worker
python -m jarvis_worker.cli ask "Berätta om Automaten 11"
```

## Runbook

Se `docs/PRODUCTION_RUNBOOK.md`.
