# Liljeblads – Fastighets- och driftplattform

En modern webbapplikation för fastighetsförvaltning, driftplanering och underhåll.
Byggd på **React + Vite** med **Supabase** som backend och **Google Gemini** för AI
(chat, embeddings, protokollanalys). **Jarvis** (LangGraph-worker) läser servicerapporter
från Google Drive och skapar arbetsordrar via **Jarvis webhook** (LangGraph-worker; ej CrewAI-runtime).

- **Kod:** https://github.com/Zvensson8/liljeblads  
- **Backend:** Supabase (t.ex. projekt Liljeblads2.0)  
- **Lokal app:** `http://localhost:8080`

---

## Innehåll

- [Funktioner](#funktioner)
- [Teknikstack](#teknikstack)
- [Arkitektur](#arkitektur)
- [Kom igång lokalt](#kom-igång-lokalt)
- [Miljövariabler](#miljövariabler)
- [Projektstruktur](#projektstruktur)
- [Backend – Supabase](#backend--supabase)
- [Edge Functions](#edge-functions)
- [Jarvis worker](#jarvis-worker)
- [Säkerhet](#säkerhet)
- [Tester och kvalitet](#tester-och-kvalitet)
- [Deploy](#deploy)

---

## Funktioner

### Fastighet & komponent
- **Fastigheter** med adress, ytor, byggår, energideklaration och fakturauppgifter.
- **Komponenter** (värmepumpar, ventilation, kyla m.m.) med serienummer, tillverkare, modell, köldmedium och registreringsnummer.
- **Ritningar & placeringar** via Fabric.js-canvas (våningsplan, drag-and-drop).
- **Import/Export** i CSV och XLSX (ExcelJS).
- **Prediktiv risk** (Weibull) med badge, filter, historik och dashboard-widget.

### Drift, service & underhållsplan
- **Serviceregistrering** – snabbrapportera med filuppladdning.
- **Servicelista per komponent** med kompakt och detaljerad vy.
- **Riskbaserad underhållsplan (5 år)** per fastighet:
  - Välj **startår + kvartal** (t.ex. Q2 2027).
  - Åtgärder schemaläggs i **utförandeår + kvartal**.
  - Endast komponenter med **tillräcklig prediktiv risk** ingår (inte allt inom 5 år).
  - Snapshot sparas i databasen; kan omräknas och arkiveras.
- **Servicekalender** (dag) som komplement till 5-årsplanen.
- **Áprislista** (org-ägare/admin): ungefärliga byteskostnader per komponenttyp
  (t.ex. entréparti ≈ 100 000 kr) som används vid plangenerering.

### Projekt & arbetsorder
- **Arbetsorder** med status, prioritet och koppling till fastighet/komponent.
- **Risk-badges** och feedback när WO slutförs.
- **Projekt** med lifecycle, KPI och AI-genererade förslag.
- **Beställningsutkast** (ABT 06) i sidopanel innan utskick.

### AI & sök (Jarvis)
- **AI Chat** med multi-turn tools (fastigheter, WO, projekt, service, komponenter, dokument, högrisk).
- **Vektorsökning** med Supabase pgvector + Gemini embeddings.
- **Kunskapsbas** (RAG) med branschstandarder och fastighetsdokument.
- **AI Actions** – granskningsbara förslag (HITL), inkl. riskbaserade WO-förslag.
- **Agentpolicy** – org-styrda trösklar för riskförslag.
- **Service-report ingest** – LangGraph-worker + Drive-mapp (08:00 / 15:00).

### Rapport & export
- **Rapporter** (kvartals-/årsvis) i XLSX och PDF.
- **DOCX-export** och **GDPR-export**.

### Organisation & säkerhet
- **Multi-tenancy** med `organization_id` och RLS.
- **Roller** i `user_roles` + `has_role()` / org-roller (`owner`, `admin`, …).
- **API-nycklar** (`lbl_`-prefix) för externa agenter (Jarvis).
- **Áprislista** under Organisationsinställningar (ägare/admin).

### UX & PWA
- **Mobile-first**, **PWA**, global sök (⌘K), optimistic updates.

---

## Teknikstack

**Frontend**
- React 18, Vite 5, TypeScript 5 (strict)
- Tailwind CSS 3 + shadcn/ui
- TanStack Query 5, Zustand
- React Hook Form + Zod

**Backend (Supabase)**
- PostgreSQL med RLS
- Edge Functions (Deno)
- pgvector + Gemini embeddings
- Storage + Supabase Auth

**AI**
- xAI Grok (rekommenderat): `XAI_API_KEY` + `LLM_PROVIDER=xai`, default `grok-4.3` (kostnadseffektiv, stark tool-calling)
- Fallback Gemini: `GOOGLE_AI_API_KEY` / `GEMINI_API_KEY` via delad `llmClient`
- Jarvis LangGraph-worker (Python) för rapport-ingest

---

## Arkitektur

```text
UI (React)
  │
  ├── Hooks  ──►  Services (src/services/supabase/*)
  │                   │
  │                   ├── createCrudService
  │                   ├── edgeFunctionService
  │                   └── storageService
  │
  ├── Prediktiv risk (Weibull) → underhållsplan-motor
  ├── React Query cache
  └── Realtime subscriptions

Backend (Supabase)
  ├── Postgres + RLS
  ├── Edge Functions ── AI, risk-cron, webhooks, e-post
  └── Storage

Jarvis worker (Python / LangGraph)
  └── Drive inbox → parse → extract → jarvis-webhook → WO / HITL
```

### Underhållsplan (översikt)

```text
Komponentrisk (Weibull / B10 / score)
        │
        ▼
maintenancePlanEngine  (start Q + 5 år, filter min risk)
        │
        ├── cost: áprislista (component_unit_prices)
        │         else purchase_cost
        ▼
maintenance_plans + maintenance_plan_items  (snapshot)
        │
        ▼
UI: Fastighet → Underhållsplan (år / kvartal)
```

---

## Kom igång lokalt

Krav: **Node.js 18+** och **npm**.

```sh
git clone https://github.com/Zvensson8/liljeblads.git
cd liljeblads
cp .env.example .env   # fyll i Supabase-nycklar
npm install
npm run dev
```

Appen körs på `http://localhost:8080`.

| Kommando            | Beskrivning             |
| ------------------- | ----------------------- |
| `npm run dev`       | Vite dev-server         |
| `npm run build`     | Produktionsbygge        |
| `npm run typecheck` | TypeScript              |
| `npm run lint`      | ESLint                  |

Se även `docs/SUPABASE_SETUP.md` och `docs/JARVIS.md`.

---

## Miljövariabler

Kopiera `.env.example` → `.env`:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=...
VITE_SUPABASE_PROJECT_ID=...
```

**Supabase secrets** (edge functions / AI) – sätts i Dashboard eller CLI:

```powershell
npx supabase secrets set XAI_API_KEY=xai-...
npx supabase secrets set LLM_PROVIDER=xai
npx supabase secrets set XAI_MODEL=grok-4.3
# valfritt Gemini-fallback / embeddings:
# npx supabase secrets set GOOGLE_AI_API_KEY=...
npx supabase secrets set RESEND_API_KEY=...
npx supabase secrets set CRON_SECRET=...
```

---

## Projektstruktur

```text
src/                  React-app
  components/         UI (property, organization, dashboard, …)
  hooks/              React Query hooks
  lib/                Risk, underhållsplan-motor, utils
  pages/              Routes
supabase/functions/   Edge Functions (Deno)
supabase/migrations/  SQL (inkl. maintenance_plans, unit_prices)
jarvis-worker/        LangGraph service-report ingest
docs/                 Setup & runbooks
```

---

## Backend – Supabase

- **RLS** på publika tabeller, multi-tenant via `organization_id`.
- **Roller** i `user_roles` (aldrig på profiles).
- **Storage** – privata buckets + signerade URL:er.
- **Realtime** via `useRealtimeInvalidation`.

### Relevanta tabeller (underhåll)

| Tabell | Syfte |
|--------|--------|
| `maintenance_plans` | Planheader (startår/kvartal, horisont, filter) |
| `maintenance_plan_items` | Åtgärder per år + kvartal |
| `component_unit_prices` | Áprislista per org (typ → byteskostnad) |
| `component_risk_snapshots` | Riskhistorik |
| `organization_agent_policies` | Trösklar för riskförslag |

**Migration (exempel):** kör nya SQL-filer i Dashboard eller:

```powershell
npx supabase db push
```

Senaste underhållsrelaterade: `supabase/migrations/20260727200000_maintenance_plans.sql`.

---

## Edge Functions

| Funktion                 | Syfte                                      |
| ------------------------ | ------------------------------------------ |
| `ai-chat`                | Jarvis chat + tools (Gemini)               |
| `ai-search`              | Vektorsökning                              |
| `analyze-protocol`       | Analys av serviceprotokoll                 |
| `generate-embeddings`    | Dokument/entitet-embeddings                |
| `parse-document`         | PDF → text                                 |
| `execute-ai-action`      | Kör granskade AI-förslag                   |
| `risk-suggest-actions`   | Cron: risk → pending AI-förslag            |
| `jarvis-webhook`         | Agent-API för LangGraph-worker (`lbl_` keys) |
| `crewai-webhook`         | Legacy-alias (samma kod som jarvis-webhook) |
| `send-*-reminders`       | E-post via Resend                          |

---

## Jarvis worker

LangGraph-ingest av servicerapporter (inbox/Drive) + CLI-chat med tools
(fastigheter, komponenter, arbetsordrar, **prediktiv risk**).

```powershell
cd jarvis-worker
# .env: LILJEBLADS_API_KEY, GOOGLE_API_KEY, MODE=live|hitl|dry_run
.\.venv\Scripts\python.exe -m jarvis_worker.cli ingest --sync-drive
.\.venv\Scripts\python.exe -m jarvis_worker.cli ask "Vilka komponenter har högst risk?"
```

- **MODE=hitl** → WO som granskningsbara AI-förslag  
- Schemalagd körning 08:00 / 15:00: `scripts/install-scheduled-tasks.ps1`  
- Detaljer: `docs/JARVIS.md`

---

## Säkerhet

- Committa aldrig `.env` eller service account JSON.
- Frontend: endast **anon/publishable** key.
- **service_role** endast i edge functions / server.
- API-nycklar för agenter: minimala permissions.
- Áprislista: läs för medlemmar, skriv för org-ägare/admin.

---

## Tester och kvalitet

- Playwright E2E (`npm run test:e2e`)
- TypeScript strict + ESLint
- Zod på formulär och kritiska API-svar
- **Unit-tester (Vitest):** `npm run test:unit` — weibull, componentRisk, maintenancePlanEngine, agentPolicy
- **Prediktiv underhåll smoke** (utan DB): `npm run test:smoke:pm`
- **Risk single source:** kanonisk kod i `src/lib/{weibull,componentRisk}.ts` → edge via `npm run sync:edge-risk`  
  CI: `npm run sync:edge-risk:check` (failar om FE/edge divergerar)
- Lokal CI: `npm run ci:local` (typecheck + unit + edge-check + PM-smoke + build)

### Prediktiv underhåll – workflow-karta (klar innan Jarvis-fas)

| Yta | Status | Plats |
|-----|--------|--------|
| Weibull math (R, F, h, B10, MLE) | ✅ | `src/lib/weibull.ts` (+ edge shared) |
| Riskscore / confidence / rekommendation | ✅ | `src/lib/componentRisk.ts` |
| Batch + filter hooks | ✅ | `useComponentRisk` / `useComponentRiskList` |
| Komponentlista filter/sort + Riskförslag | ✅ | `Components.tsx` |
| Dashboard högrisk-widget | ✅ | `HighRiskComponentsWidget` |
| WO risk-badge | ✅ | `WorkOrders.tsx` |
| HITL risk → `ai_suggested_actions` | ✅ | `riskSuggestions.ts` + policy |
| Cron risk-förslag + snapshots | ✅ | `risk-suggest-actions` edge |
| WO completed → stäng förslag + snapshot | ✅ | `riskFeedback` / `completeWorkOrder` |
| Agentpolicy UI | ✅ | Org → Agent & risk |
| Agent activity | ✅ | `AgentActivity.tsx` |
| Chat tool `list_high_risk_components` | ✅ | `jarvisTools.ts` |
| 5-årsplan (år+kvartal, start-Q) | ✅ | `maintenancePlanEngine` + Property-flik |
| Áprislista CRUD | ✅ | Org → Áprislista |
| Edge/FE risk i sync | ✅ | `scripts/sync-edge-risk.mjs` |

---

## Deploy

1. **Frontend:** `npm run build` → deploy `dist/` (Vercel, Cloudflare Pages, Netlify, …)  
2. **Backend:** Supabase (migrationer + `npx supabase functions deploy …`)  
3. Sätt build-time env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`

---

## Licens

Proprietär – © Liljeblads. All rights reserved.
