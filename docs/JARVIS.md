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
| `live` | Direkt | Ja (om match) | Full automation |
| `hitl` / `suggest` | Pending AI | Ja (om match) | **Rekommenderat i vardagen** |
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

## Jarvis i vardagen (rekommenderad drift)

| Inställning | Värde | Varför |
|-------------|-------|--------|
| `MODE` | `hitl` (eller legacy `suggest`) | WO → pending AI-förslag; service loggas vid match |
| `DRIVE_SYNC_ENABLED` | `true` | Hämta PDF från Drive-mapp innan lokal inbox |
| `GOOGLE_DRIVE_FOLDER_ID` | mapp-id | Inbox i Drive |
| `GOOGLE_APPLICATION_CREDENTIALS` | path till SA JSON | Läsbehörighet på mappen |
| `NOTIFY_EMAIL` | `auto` | Sammanfattning till nyckelns ägare |

### Schema 08:00 / 15:00 (Windows)

```powershell
cd jarvis-worker
powershell -ExecutionPolicy Bypass -File .\scripts\install-scheduled-tasks.ps1
```

Det skapar `JarvisIngestMorning` (08:00) och `JarvisIngestAfternoon` (15:00).  
Skriptet `run-ingest.ps1` kör `python -m jarvis_worker.cli ingest --sync-drive` (Drive + lokal inbox, MODE från `.env`).

Manuell körning nu:

```powershell
cd jarvis-worker
.\.venv\Scripts\Activate.ps1
powershell -File .\scripts\run-ingest.ps1
# eller:
python -m jarvis_worker.cli ingest --sync-drive
```

Granska resultat i appen: **AI-förslag** / Agent-aktivitet / Arbetsordrar.  
Loggar: `jarvis-worker/logs/ingest_*.log`

### Checklista morgon/eftermiddag

1. Drive-mappen har nya servicerapporter (PDF)
2. Schemat eller manuell `run-ingest.ps1` har kört utan fel
3. Pending förslag granskas i Liljeblads
4. Vid behov: `python -m jarvis_worker.cli ask "Lista öppna arbetsordrar"`

## Designval

- **LangGraph** (inte CrewAI runtime) — pipeline i `jarvis-worker/`
- Webhook-funktionen kan heta `crewai-webhook` **eller** `jarvis-webhook` (samma kod; CrewAI-namnet är legacy-URL)
- Prediktiv risk = samma Weibull som appen (`_shared/componentRisk`)
- Auto-WO default; HITL via `MODE=hitl`
- Innehålls-hash + Drive-id för dedupe

## Full fastighets-Q&A

| Kanal | Hur |
|-------|-----|
| **App AI-chat / bubble** | Tools: `get_property_overview`, dokument-RAG, risk, WO, apply_*, send_to_me … |
| **Worker CLI** | Samma data via webhook-tools |

`get_property_overview` samlar: grunddata (inkl. `invoice_address`, LOA, yta), komponenter, öppna WO/todos, anteckningar, dokumentlista, kontakter, högrisk, underhållsplan.

Dokument**innehåll** kräver indexerade embeddings (`search_property_documents` / app-upload).

---

## App-Jarvis (chat): läge, säkerhet, spårbarhet

### apply_* vs suggest_* vs send_to_me

| Läge | När | Effekt |
|------|-----|--------|
| **`apply_*`** | Användaren ber **uttryckligen** (skapa, ändra status, uppdatera…) | Skrivs **direkt** i DB |
| **`suggest_*`** | Jarvis föreslår självmant / osäker | Utkast i **Förslag** (HITL) |
| **`send_to_me`** | “Skicka till mig” | E-post **endast** till inloggad användare |

### Säkerhet (e-post)

- `send_to_me` ignorerar/blockerar modell-angivna `to` / `recipient` / `email`.
- Mottagare = alltid sessionens `auth.users.email`.
- Extern mejl till entreprenör/kund stöds **inte** (avsiktligt).

### Grounding

- Läsverktyg returnerar **kritiska fält** (t.ex. `invoice_address`) med explicita null.
- Prompt: citera tool-resultat; säg aldrig “saknas” utan att ha läst fältet.
- **Sidokontext**: bubble/chat skickar `pageContext` (`property_id` / `project_id` från URL) så “denna fastighet” fungerar.

### Action log + UI

| Del | Plats |
|-----|--------|
| Audit-tabell | `jarvis_action_log` (org, user, tool, args/result summary, entity, länk) |
| Chat-bekräftelse | `appliedActions` i ai-chat-svar → kort med deep-link (Öppna WO/projekt/fastighet) |

Migrering: `supabase/migrations/20260811200000_jarvis_action_log.sql`

### Deploy (krävs efter kodändring)

```powershell
npx supabase login
npx supabase db push
# eller kör SQL-migreringen i dashboard
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

### P1 (klart i kod): full förvaltare-agent

| Tool | Effekt |
|------|--------|
| `apply_create_component` / `apply_update_component` | Komponent direkt |
| `apply_log_service` | `maintenance_history` på komponent |
| `apply_create_contact` / `apply_update_contact` | Fastighetskontakt |
| `apply_create_todo` | Todo på fastighet |
| `list_contacts` | Läs kontakter |
| `get_daily_briefing` | Org-status (WO, risk, AI-förslag…) |
| `suggest_create_component` / `suggest_log_service` / `suggest_create_contact` | HITL-varianter |
| Edge `jarvis-daily-briefing` | Vardagar cron → mejl till **owner/admin** (egen e-post, en mottagare i taget) |

HITL-godkännande i `execute-ai-action` för: `create_component`, `log_service`, `create_contact`.

Eval (CI/unit): `src/lib/jarvisPolicy.test.ts` — e-postsäkerhet, grounding, deep-links, briefing-format.

```powershell
npm run test:unit
# efter deploy:
npx supabase functions deploy ai-chat --project-ref ojiswgqntenvbwtopxbu
npx supabase functions deploy execute-ai-action --project-ref ojiswgqntenvbwtopxbu
npx supabase functions deploy jarvis-daily-briefing --project-ref ojiswgqntenvbwtopxbu
node scripts/schedule-agent-crons.mjs
```

### P2 (klart i kod): undo, batch, idempotency

| Del | Hur |
|-----|-----|
| **Idempotency** | `idempotency_key` / `client_request_id` på apply_* → samma key returnerar tidigare resultat (ingen dubblett) |
| **Undo 5 min** | `reverse_payload` i `jarvis_action_log`; tools `undo_last_action` / `undo_jarvis_action`; edge `jarvis-undo`; knappen **Ångra** i chat-kort |
| **Batch** | `batch_apply_actions` max 10 apply_* (t.ex. WO på högrisk-lista); varje steg loggas; `stop_on_error` default true |
| **Spår** | `list_recent_jarvis_actions` |

Migrering: `20260811210000_jarvis_p2_undo_idempotency.sql`  
Ej ångringsbart: `send_to_me` (skickad e-post), utgången fönster, redan ångrat.

```powershell
# SQL-migrering i dashboard eller:
npx supabase db push
npx supabase functions deploy ai-chat --project-ref ojiswgqntenvbwtopxbu
npx supabase functions deploy jarvis-undo --project-ref ojiswgqntenvbwtopxbu
npx supabase functions deploy execute-ai-action --project-ref ojiswgqntenvbwtopxbu
npx supabase functions deploy jarvis-daily-briefing --project-ref ojiswgqntenvbwtopxbu
```

### P3 (klart i kod): zip/mapp in → index (data stannar i systemet)

| Del | Hur |
|-----|-----|
| **Zip / mapp-upload** | Fastighet → Dokument: dra zip, multi-filer eller mappväljare |
| **Expand** | `src/lib/zipDocumentIngest.ts` (JSZip, max 40 filer, allowlist) |
| **Batch-logg** | `document_ingest_batches` (source zip/folder/upload, ok/fail) |
| **Index** | Befintlig trigger → `embedding_queue` → `generate-embeddings` / cron |
| **Jarvis tools** | `list_property_documents`, `list_document_ingest_batches`, `search_property_documents` |

**Policy:** ingen godtycklig filsystem/URL-access.  
**Nästa (connectors, ej i P3-kod):** SharePoint/OneDrive **läs-only** via OAuth + mapp-picker.

Migrering: `20260811220000_document_ingest_batches.sql`

```powershell
# SQL i dashboard, sedan:
npx supabase functions deploy ai-chat --project-ref ojiswgqntenvbwtopxbu
```

### Roadmap (inom systemet först)

1. ~~Grounding + action log + sidokontext + bekräftelsekort~~ (sprint 1)
2. ~~Fullare CRUD (komponent, service, kontakt) + daily briefing + eval~~ (P1)
3. ~~Undo, batch-apply, idempotency~~ (P2)
4. ~~Upload/zip → index~~ (P3)
5. **Senare** — SharePoint/Drive read connector (gated)

## Runbook

Se `docs/PRODUCTION_RUNBOOK.md`.
