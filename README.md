# Liljeblads – Fastighets- och driftplattform

En modern webbapplikation för fastighetsförvaltning, driftplanering och underhåll.
Byggd på **React + Vite** med **Supabase** som backend och **Google Gemini** för AI
(chat, embeddings, protokollanalys). **Jarvis** (LangGraph-worker) läser servicerapporter
från Google Drive och skapar arbetsordrar via `crewai-webhook`.

- **Kod:** https://github.com/Zvensson8/liljeblads  
- **Backend:** Supabase-projekt (t.ex. Liljeblads2.0)  
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

### Drift & service
- **Serviceregistrering** – snabbrapportera med filuppladdning.
- **Servicelista per komponent** med kompakt och detaljerad vy.
- **Underhållsplan** och drifttriggers som synkar servicehistorik med operativ uppföljning.

### Projekt & arbetsorder
- **Arbetsorder** med status, prioritet och koppling till fastighet/komponent.
- **Projekt** med lifecycle, KPI och AI-genererade förslag.
- **Beställningsutkast** (ABT 06) i sidopanel innan utskick.

### AI & sök (Jarvis)
- **AI Chat** med multi-turn tools (fastigheter, WO, projekt, service, komponenter, dokument).
- **Vektorsökning** med Supabase pgvector + Gemini embeddings.
- **Kunskapsbas** (RAG) med branschstandarder.
- **AI Actions** – förslag för manuell granskning (human-in-the-loop).
- **Document Brain** – uppladdade fastighetsdokument indexeras för chat.
- **Service-report ingest** – LangGraph-worker + Drive-mapp (08:00 / 15:00).

### Rapport & export
- **Rapporter** (kvartals-/årsvis) i XLSX och PDF.
- **DOCX-export** och **GDPR-export**.

### Organisation & säkerhet
- **Multi-tenancy** med `organization_id` och RLS.
- **Roller** i `user_roles` + `has_role()`.
- **API-nycklar** (`lbl_`-prefix) för externa agenter (Jarvis).

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
- Google Gemini (`GOOGLE_AI_API_KEY`, modell t.ex. `gemini-flash-latest`)
- Valfritt xAI/Grok via `LLM_PROVIDER=xai` + `XAI_API_KEY`
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
  ├── React Query cache
  └── Realtime subscriptions

Backend (Supabase)
  ├── Postgres + RLS
  ├── Edge Functions ── AI, rapporter, webhooks, e-post
  └── Storage

Jarvis worker (Python / LangGraph)
  └── Drive inbox → parse → extract → crewai-webhook → WO + service
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

**Supabase secrets** (edge functions / AI):

```powershell
npx supabase secrets set GOOGLE_AI_API_KEY=...
npx supabase secrets set GEMINI_MODEL=gemini-flash-latest
npx supabase secrets set LLM_PROVIDER=gemini
npx supabase secrets set RESEND_API_KEY=...
npx supabase secrets set CRON_SECRET=...
```

`LOVABLE_API_KEY` används **inte** längre.

---

## Projektstruktur

```text
src/                  React-app
supabase/functions/   Edge Functions (Deno)
supabase/migrations/  SQL
jarvis-worker/        LangGraph service-report ingest
docs/                 Setup & runbooks
```

---

## Backend – Supabase

- **RLS** på publika tabeller, multi-tenant via `organization_id`.
- **Roller** i `user_roles` (aldrig på profiles).
- **Storage** – privata buckets + signerade URL:er.
- **Realtime** via `useRealtimeInvalidation`.

---

## Edge Functions

| Funktion              | Syfte                                      |
| --------------------- | ------------------------------------------ |
| `ai-chat`             | Jarvis chat + tools (Gemini)               |
| `ai-search`           | Vektorsökning                              |
| `analyze-protocol`    | Analys av serviceprotokoll                 |
| `generate-embeddings` | Dokument/entitet-embeddings                |
| `parse-document`      | PDF → text                                 |
| `execute-ai-action`   | Kör granskade AI-förslag                   |
| `crewai-webhook`      | Extern agent-API (`lbl_` keys)             |
| `send-*-reminders`    | E-post via Resend                          |

---

## Jarvis worker

```powershell
cd jarvis-worker
# konfigurera .env (webhook, API-key, Drive, Resend, Gemini)
.\.venv\Scripts\python.exe -m jarvis_worker.cli ingest
```

Schemalagd körning 08:00 / 15:00: `scripts/install-scheduled-tasks.ps1`  
Detaljer: `docs/JARVIS.md`.

---

## Säkerhet

- Committa aldrig `.env` eller service account JSON.
- Frontend: endast **anon/publishable** key.
- **service_role** endast i edge functions / server.
- API-nycklar för agenter: minimala permissions.

---

## Tester och kvalitet

- Playwright E2E (`npm run test:e2e`)
- TypeScript strict + ESLint
- Zod på formulär och kritiska API-svar

---

## Deploy

1. **Frontend:** `npm run build` → deploy `dist/` (Vercel, Cloudflare Pages, Netlify, …)  
2. **Backend:** Supabase (migrationer + `npx supabase functions deploy …`)  
3. Sätt build-time env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`

---

## Licens

Proprietär – © Liljeblads. All rights reserved.
