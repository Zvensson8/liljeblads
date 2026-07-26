# Produktionschecklista – Liljeblads + Jarvis

## Dagligen

- [ ] PDF-servicerapporter läggs i `jarvis-worker/inbox/` **eller** Drive-mappen (om aktiverad)
- [ ] Schemat kör **08:00** och **15:00** (`JarvisIngestMorning` / `JarvisIngestAfternoon`)
- [ ] Kolla logg: `jarvis-worker/logs/ingest_*.log` vid fel
- [ ] I appen: **Arbetsordrar** + komponent → **Arbetsordrar** / servicehistorik

## Veckovis

- [ ] Markera klara WO som **Slutförd** och bekräfta slutkostnad
- [ ] Rensa `inbox/processed` om den växer (arkiv)
- [ ] Kontrollera Gemini-kvot / Resend-kvot

## Manuell ingest

```powershell
cd C:\Users\andre\Documents\liljeblads\jarvis-worker
.\.venv\Scripts\Activate.ps1
python -m jarvis_worker.cli ingest
# Med Drive:
python -m jarvis_worker.cli ingest --sync-drive
```

## Chat (v0)

```powershell
python -m jarvis_worker.cli chat
# eller
python -m jarvis_worker.cli ask "Lista mina fastigheter"
python -m jarvis_worker.cli ask "Sök komponent SN-TEST-001"
```

## Drive-setup (steg 2)

1. Google Cloud Console → Service Account → JSON-nyckel  
2. Dela Drive-mappen med service account-e-posten (Viewer)  
3. I `jarvis-worker/.env`:
   ```env
   DRIVE_SYNC_ENABLED=true
   GOOGLE_DRIVE_FOLDER_ID=...
   GOOGLE_APPLICATION_CREDENTIALS=C:\path\to\sa.json
   ```
4. `pip install google-auth` (redan i pyproject)  
5. Test: `python -m jarvis_worker.cli ingest --sync-drive`

## När WO skapas / slutförs

| Händelse | Effekt |
|----------|--------|
| Ingest | WO `not_started` + `component_id` + föreslaget `price` |
| UI: status → Slutförd | Dialog kostnad → `maintenance_history.cost` på komponent |

## Felsökning

| Symptom | Åtgärd |
|---------|--------|
| 0 properties | API-nyckel fel org / ingen fastighet |
| WO syns inte på komponent | Saknar `component_id` – kolla matchning serienr/namn |
| Gemini 429 | Heuristik används; aktivera billing eller nyckel |
| Drive 403 | Dela mapp med service account |
| Schema körs inte | PC måste vara på; Task Scheduler → History |

## Schema ominstallera

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-scheduled-tasks.ps1
```
