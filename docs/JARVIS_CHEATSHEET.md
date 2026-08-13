# Jarvis — snabbguide (1 sida)

**Öppna:** `/jarvis` eller bubblan nere till höger.

## Säg så här (fungerar bäst)

| Du vill… | Säg ungefär |
|----------|-------------|
| Skapa WO | `Skapa en arbetsorder på [fastighet]: [åtgärd]. Utförare [namn], kostnad [kr], Q3 2026.` |
| Ändra status | `Ändra status på arbetsordern [text] till ordered` |
| Få info till dig | `Skicka fakturaadressen för [fastighet] till mig` |
| Översikt | `Ge mig en översikt av [fastighet]` / `Daglig briefing` |
| Risk | `Vilka komponenter har högst risk på [fastighet]?` |
| Dokument | Ladda upp PDF/zip under **Fastighet → Dokument**, fråga sedan `Sök i dokumenten efter …` |
| Kostnad | `Lägg till kostnad 15000 kr material på projekt [nr/namn]` |
| Todo | `Skapa todo "Ring Axcell" på [fastighet]` / `Markera todo … som klar` |
| Ångra | Klicka **Ångra** på gröna kortet (5 min) eller säg `Ångra senaste åtgärden` |
| Se spår | **Jarvis → Logg** |

## Tre regler

1. **Säg vad som ska hända** — “skapa”, “ändra”, “logga”, “skicka till mig” → Jarvis skriver i systemet.  
2. **Mejl går bara till dig** (inloggad adress) — inte till entreprenör.  
3. **Externa mappar** = zip/mapp-upload in i Liljeblads (inte “läs C:\”).

## Fas 5

| | |
|--|--|
| **Röst** | Mikrofonknappen (Chrome/Edge) — diktera på svenska |
| **Offline** | Kan inte skicka till Jarvis offline (apply avstängt) |
| **Läsare** | Roll “Läsare” får fråga men inte skapa/ändra |
| **Byt org** | Sidebar — din roll visas under org-namnet |

## Flikar

| Flik | |
|------|--|
| **Chat** | Fråga och agera |
| **Förslag** | HITL — godkänn AI-utkast |
| **Logg** | Senaste apply + ångra |

## Drift (morgon, 2 min)

1. Nya PDF uppladdade? Badge **AI-indexerad** inom ~15 min.  
2. Embedding-kö: Dashboard-widget / processa kö om den växer.  
3. Briefing: vardagsmejl om cron är på (ägare/admin).  

Mer: `docs/JARVIS.md`, `docs/SYSTEM_IMPROVEMENT_PLAN.md`.
