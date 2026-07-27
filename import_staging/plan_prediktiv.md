LILJEBLADS
Plan för prediktiv risk &amp; agentic closed-loop
Version 1.0  •  27 juli 2026
1. Bakgrund och syfte
Liljeblads är en egenutvecklad PropTech-plattform för teknisk fastighetsförvaltning. Plattformen har redan en stark operativ bas (fastigheter, komponenter, servicehistorik, arbetsordrar, projekt, RAG, AI-chat och Jarvis-worker).
Målet med denna plan är att ta plattformen till nästa nivå genom att fokusera på två områden:
Prediktiv riskanalys – Weibull-baserad komponentrisk som blir synlig och styrande i det dagliga arbetet.
Agentic closed-loop – AI-agenter som övervakar risk, föreslår och stegvis utför åtgärder.
Medvetet bortprioriterat: Live sensor-/IoT-lager, edge connectors, realtidstelemetri och heatmaps. Dessa tas inte med i denna plan.
2. Nuvarande läge (juli 2026)
2.1 Klart / starkt
Full multi-tenant fastighets- och komponenthantering med ritningar (Fabric.js)
Servicehistorik, snabbregistrering, arbetsordrar och projekt med checklistor
RAG + pgvector + embeddings, protokollanalys (PDF) och AI-chat med tool calling
Jarvis-worker (PDF-ingestion → extraktion → service/WO via LangGraph-stil)
CrewAI-webhook för externa agenter
Weibull-analys implementerad (weibull.ts, componentRisk.ts, hooks, badge + alert på komponentdetalj)
2.2 Delvis klart
Riskscore finns men syns främst på detaljsidan
Agenter kan föreslå åtgärder men saknar full closed-loop
2.3 Mognadsgrad (uppskattning)
Område
Mognad
Kommentar
Operativ teknisk förvaltning
75–80 %
Mycket stark bas
Prediktiv risk (Weibull)
35–40 %
Kärna klar, UI/integration kvar
Agentic closed-loop
25–35 %
Grund finns (Jarvis + webhook)
Live sensor / IoT-lager
15–25 %
Medvetet skippat

3. Målbild
Liljeblads ska bli en prediktiv och agentdriven teknisk förvaltningsplattform där:
Komponentrisk baserad på Weibull är synlig i listor, dashboard och arbetsordrar
Riskscore aktivt styr prioritering och genererar konkreta förslag
Agenter övervakar riskbilden, skapar granskningsbara förslag och stegvis får mer autonomi
Allt bygger på befintlig data (servicehistorik, komponenter, protokoll, RAG) utan krav på nya sensorer
4. Prioriterad roadmap
Fas 1 – Gör prediktiv risk operativ (1–3 veckor)
Mål: Risk ska synas och styra beslut utan att man behöver öppna varje komponent.
Steg
Leverans
Prio
Estimat
1.1
Risk-kolumn + sortering/filter i komponentlistan
Hög
2–4 d
1.2
Dashboard-widget ”Högriskkomponenter” (top N, klickbar)
Hög
2–3 d
1.3
Risknivå + rekommendation i arbetsorder- och projektvyer
Medel
1–2 d
1.4
Automatiska WO-förslag när risk ≥ high/critical (granskningsbara)
Hög
3–5 d
1.5
Enkel riskhistorik per komponent
Låg
2–3 d

Fas 2 – Agent som använder risk (3–6 veckor)
Mål: En eller flera agenter som aktivt jobbar med riskbilden.
Steg
Leverans
Prio
Estimat
2.1
Batch-riskagent som kör över portföljen och skapar granskningsbara förslag
Hög
4–7 d
2.2
Chat-stöd: ”Vilka komponenter har högst risk?” / ”Föreslå åtgärder för top 5”
Hög
2–4 d
2.3
Jarvis + Weibull-koppling: nya protokoll uppdaterar riskbilden
Medel
3–5 d
2.4
Multi-agent-flöde (Risk → Prioritering → WO) via CrewAI/LangGraph
Medel
5–8 d
2.5
Feedback-loop: slutförd WO påverkar riskscore
Medel
2–4 d

Fas 3 – Closed-loop med kontrollerad autonomi (6–12+ veckor)
Mål: Agenter får mer handlingsfrihet under tydliga guardrails.
Steg
Leverans
Prio
Estimat
3.1
Agent får skapa arbetsordrar direkt (med logg + ångra)
Hög
4–6 d
3.2
Policy/regler: vilka risknivåer och komponenttyper som får automatiseras
Hög
2–3 d
3.3
Övervakningsdashboard för agent-aktivitet och resultat
Medel
3–5 d
3.4
Kontinuerlig förbättring av Weibull-modellen med mer data
Låg–Medel
Löpande
5. Teknisk inriktning
All utveckling ska bygga vidare på befintlig stack och mönster:
Frontend: React + Vite + TypeScript + TanStack Query + shadcn/ui
Backend: Supabase (Postgres + RLS + Edge Functions)
Riskberäkning: Pure TypeScript i componentRisk.ts + weibull.ts (ingen extern stats-dependency)
Agenter: Bygger vidare på AI-chat + tool calling, CrewAI-webhook och Jarvis-worker
Förslag: Alla agentförslag sparas i ai_suggested_actions (eller motsvarande) för granskning
Spårbarhet: All agent-aktivitet ska vara audit-loggad
6. Framgångsmått
Riskscore syns och används i listor + dashboard
Minst 30–50 % av högriskkomponenter får ett konkret förslag inom rimlig tid
Agent kan svara korrekt på riskfrågor i chatten
Minskad manuell tid för att hitta och prioritera komponenter som behöver åtgärd
Tydlig logg över vad agenten föreslagit vs vad som faktiskt utförts
7. Rekommenderad startordning
Börja i denna ordning för snabbast synligt värde:
Risk-kolumn + sortering i komponentlistan (Components.tsx)
Dashboard-widget för högriskkomponenter
Automatiska WO-förslag baserat på riskscore
Batch-riskagent som skapar granskningsbara förslag
8. Sammanfattning
Genom att fokusera på prediktiv risk och agentic closed-loop (och medvetet skippa sensorlagret) kan Liljeblads snabbt gå från en stark operativ plattform till en verkligt prediktiv och delvis autonom förvaltningslösning.
Kärnan i Weibull-analysen finns redan. Nästa steg handlar om att göra den synlig, användbar och kopplad till agenter som kan agera på den.
Dokumentstatus: Levande arbetsdokument. Uppdateras vid större vägval eller när faser slutförs.
— Slut på dokument —
