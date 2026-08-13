# Jarvis / AI — morgonchecklista (2–5 min)

1. **Dokument** — Nya PDF/zip uppladdade igår? Under Fastighet → Dokument: badge **AI-indexerad**?  
2. **Kö** — Om många “Väntar index”: Dashboard embedding-widget → processa kö, eller invänta cron (var 15:e min om schemalagd).  
3. **Briefing** — Ägare/admin: mejl från Jarvis vardagar ~06:15 UTC (om cron på).  
4. **Logg** — `/jarvis?tab=log` — oväntade apply?  
5. **Förslag** — `/jarvis?tab=actions` — pending HITL att godkänna?  

Schemalägg cron (en gång per miljö):

```powershell
node scripts/schedule-agent-crons.mjs
```

Kräver `CRON_SECRET` + `SUPABASE_ACCESS_TOKEN` i `.secrets.local`.
