# Liljeblads – Fastighets- och driftplattform

En modern webbapplikation för fastighetsförvaltning, driftplanering och underhåll. Byggd på React + Vite med Lovable Cloud (Supabase) som backend, och integrerad med Lovable AI Gateway för AI-driven analys, sökning och automation.

- **Live-preview:** https://id-preview--37ca34e8-7a8d-442f-993b-3c47e5f8990d.lovable.app
- **Publicerad app:** https://liljeblads.lovable.app
- **Projekt i Lovable:** https://lovable.dev/projects/37ca34e8-7a8d-442f-993b-3c47e5f8990d

---

## Innehåll

- [Funktioner](#funktioner)
- [Teknikstack](#teknikstack)
- [Arkitektur](#arkitektur)
- [Kom igång lokalt](#kom-igång-lokalt)
- [Miljövariabler](#miljövariabler)
- [Projektstruktur](#projektstruktur)
- [Backend – Lovable Cloud](#backend--lovable-cloud)
- [Edge Functions](#edge-functions)
- [CrewAI-webhook](#crewai-webhook)
- [Säkerhet](#säkerhet)
- [Tester och kvalitet](#tester-och-kvalitet)
- [Deploy](#deploy)

---

## Funktioner

### Fastighet & komponent
- **Fastigheter** med adress, ytor, byggår, energideklaration och fakturauppgifter.
- **Komponenter** (värmepumpar, ventilation, kyla m.m.) med serienummer, tillverkare, modell, köldmedium och registreringsnummer.
- **Ritningar & placeringar** via Fabric.js-canvas (våningsplan, drag-and-drop, `e.scenePoint`-mappning).
- **Import/Export** i CSV och XLSX (ExcelJS, ingen Prototype Pollution).

### Drift & service
- **Serviceregistrering** – Snabbrapportera med filuppladdning (max 20 MB).
- **Service vs serviceåtgärder** – ett servicetillfälle (datum) kan innehålla flera åtgärder.
- **Servicelista per komponent** med kompakt och detaljerad vy.
- **Filter** på fastighetssidan: typ, tillverkare, modell, samt servicefilter (alla / senaste / med / utan registrerad service).
- **Underhållsplan** och drifttriggers som synkar servicehistorik med operativ uppföljning.

### Projekt & arbetsorder
- **Arbetsorder** med tre statustabeller, prioritetsfärger och `property_id`-join.
- **Projekt** med lifecycle-checklists, KPI-flikar och AI-genererade förslag (`forslag`-enum).
- **AI-drafts (ABT 06)** förhandsvisas i sidopanel innan beställning.

### AI & sök
- **AI Chat** (SSE-streaming, svensk sammanfattningsstruktur, uppföljningsfrågor).
- **Vektorsökning** med Supabase pgvector + Gemini embeddings.
- **Kunskapsbas** (RAG) med branschstandarder chunkade och embeddade.
- **AI Actions** – tool calling som skapar förslag för manuell granskning.
- **Protokollanalys** – extraherar tekniska värden (t.ex. 19,6 °C) och rekommendationer ur PDF.

### Rapport & export
- **Rapporter** (kvartals-/årsvis) i XLSX och landskaps-PDF.
- **Multi-property-rapporter** med avvikelser markerade.
- **DOCX-export** för professionella dokument (ljusa färger, ingen mörk bakgrund).
- **GDPR-export** i XLSX + PDF.

### Organisation, användare & säkerhet
- **Multi-tenancy** – all data scopas med `organization_id`, `organizations_public`-vy för icke-admin.
- **Roller** i separat `user_roles`-tabell + `has_role()` SECURITY DEFINER.
- **Founder/Admin** har exklusiv åtkomst till Security- och Reports-moduler.
- **Session timeout** 30 min inaktivitet, lösenordspolicy 12 tecken/upper/lower/number/special.
- **Audit log** scopad per organisation.
- **API-nycklar** (`lbl_`-prefix) för externa integrationer (t.ex. CrewAI, Twin.so).

### UX & PWA
- **Mobile-first** med bottom-nav och VisualViewport-offsets.
- **PWA** – offline-stöd, service worker och sync.
- **Optimistic updates** i drift/operations och todos.
- **⌘K global search** med snabbåtgärder.
- **Undo-toast** (5 s) för destruktiva åtgärder.
- **Hover-prefetch** för snabbare navigation.
- **RouteErrorBoundary** per rutt.

---

## Teknikstack

**Frontend**
- React 18, Vite 5, TypeScript 5 (strict)
- Tailwind CSS 3 + shadcn/ui (semantiska tokens i `index.css`)
- TanStack Query 5, Zustand
- React Hook Form + Zod (alla formulär validerade)
- Fabric.js v7 (canvas), Leaflet + OpenStreetMap (kartor)
- ExcelJS, docx, jsPDF 4

**Backend (Lovable Cloud / Supabase)**
- PostgreSQL med RLS
- Edge Functions (Deno)
- pgvector + Gemini embeddings
- Storage (privata buckets + signerade URL:er)
- Supabase Auth (Google OAuth default)

**AI**
- Lovable AI Gateway (chat, embeddings, image-gen, TTS/STT)

---

## Arkitektur

```text
UI (React)
  │
  ├── Hooks  ──►  Services (src/services/supabase/*)
  │                   │
  │                   ├── createCrudService (generisk CRUD)
  │                   ├── edgeFunctionService (typad invoke + felöversättning)
  │                   └── storageService (privata buckets, signed URLs)
  │
  ├── React Query cache (queryKeys.ts)
  └── Realtime subscriptions (realtimeRegistry.ts)

Backend (Lovable Cloud)
  ├── Postgres + RLS
  ├── Edge Functions (Deno) ── AI, rapporter, webhooks, e-post
  └── Storage buckets       ── privata + signerade URL:er
```

Endast hooks får anropa services – komponenter anropar aldrig `supabase.from(...)` direkt.

---

## Kom igång lokalt

Krav: **Node.js 18+** och **npm** (installera gärna via [nvm](https://github.com/nvm-sh/nvm)).

```sh
git clone <repo-url>
cd <repo>
npm install
npm run dev
```

Appen körs på `http://localhost:8080`.

### Skript

| Kommando            | Beskrivning                          |
| ------------------- | ------------------------------------ |
| `npm run dev`       | Startar Vite dev-server              |
| `npm run build`     | Produktionsbygge                     |
| `npm run build:dev` | Utvecklingsbygge                     |
| `npm run preview`   | Förhandsgranska buildad app          |
| `npm run lint`      | ESLint                               |

---

## Miljövariabler

`.env` genereras automatiskt av Lovable Cloud. Redigera **inte** manuellt:

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...
VITE_SUPABASE_PROJECT_ID=...
```

Hemligheter (API-nycklar, tokens) hanteras via Lovable Cloud Secrets och läses i edge functions från `vault.decrypted_secrets`.

---

## Projektstruktur

```text
src/
  components/         React-komponenter (per domän)
  hooks/              Data-hooks (React Query), auth, UI-hooks
  pages/              Routes (Properties, Components, Projects, ...)
  services/supabase/  Data-lager – enda tillåtna .from()-anropen
  types/domain/       Zod-scheman + typer (single source of truth)
  lib/                Utils, export, validering, query keys
  integrations/       Auto-genererad Supabase-klient (ej redigeras)
  store/              Zustand-stores
supabase/
  functions/          Edge Functions (Deno)
  config.toml         Auto-genererad
```

---

## Backend – Lovable Cloud

- **RLS** är aktiv på alla publika tabeller. Varje ny tabell kräver `GRANT` + policies.
- **Multi-tenancy:** alltid `organization_id` vid INSERT; icke-admin queries mot `organizations_public`.
- **Roller** lagras i separat `user_roles`-tabell (aldrig på profiles).
- **Storage** – privata buckets, signerade URL:er, RLS extraherar IDs från path.
- **Realtime** invalideras via `useRealtimeInvalidation`.

---

## Edge Functions

Utvalda funktioner under `supabase/functions/`:

| Funktion                            | Syfte                                             |
| ----------------------------------- | ------------------------------------------------- |
| `ai-chat`                           | SSE-streamad chat med kontextaugmentering         |
| `ai-search`                         | Vektorsökning + keyword                           |
| `analyze-protocol`                  | Extraherar värden ur serviceprotokoll             |
| `generate-embeddings`               | Genererar Gemini embeddings                       |
| `backfill-embeddings`               | Batch för äldre poster                            |
| `ingest-knowledge-base`             | Chunking + embeddings av branschstandarder        |
| `parse-document`                    | pdfjs-serverless textextraktion                   |
| `execute-ai-action`                 | Kör granskade AI-förslag                          |
| `generate-scheduled-reports`        | Cron-drivna rapporter                             |
| `preview-report`                    | Förhandsvisning av rapport                        |
| `send-work-order-draft`             | E-post med arbetsorderutkast (ABT 06)             |
| `send-project-order-draft`          | E-post projektbeställning                         |
| `send-property-info`                | E-post fastighetsuppgifter (fakturering m.m.)     |
| `send-maintenance-reminders`        | Påminnelser om service                            |
| `send-todo-reminders`               | Todo-påminnelser                                  |
| `check-and-send-reminders`          | Cron-jobb (verify_jwt=false)                      |
| `export-organization-data`          | GDPR-export                                       |
| `twin-webhook`                      | Twin.so-integration                               |
| `crewai-webhook`                    | Extern agent-API (se nedan)                       |

Cron-drivna funktioner måste ha `verify_jwt = false` i `config.toml`.

---

## CrewAI-webhook

Publik endpoint autentiserad med API-nycklar (`lbl_...`) från tabellen `api_keys`. Rättigheter kontrolleras per anrop.

**Payload-typer:**

| `type`               | Rättighet             | Beskrivning                                            |
| -------------------- | --------------------- | ------------------------------------------------------ |
| `todo`               | `create_todo`         | Skapar en rad i `property_todos`                       |
| `work_order`         | `create_work_order`   | Skapar arbetsorder (`property_name` eller `property_id`) |
| `search_components`  | `read_components`     | Söker på namn/serienr/reg-nr inom organisation         |
| `log_service`        | `log_service`         | Loggar service i `maintenance_history`                 |
| `list_services`      | `log_service`         | Listar service och dokument för en komponent           |
| `delete_service`     | `log_service`         | Tar bort en service och dess filer                     |

Alla åtgärder loggas i `ai_suggested_actions` för granskning.

---

## Säkerhet

- Alla `SECURITY DEFINER`-funktioner har begränsad EXECUTE (endast nödvändiga roller).
- Publika storage buckets tillåter inte listning (`organization-logos` har smala SELECT-policies).
- `component-documents` kräver ägarskap/medlemskap.
- Edge functions rate-limitas via `public.api_rate_limits` (10–20/min för känsliga endpoints).
- Chart-komponenter använder `isValidCSSColor` för att förhindra CSS-injection.
- Sårbara beroenden hålls uppdaterade (t.ex. `jspdf ≥ 4.2.1`).

Rapportera säkerhetsproblem via projektägaren.

---

## Tester och kvalitet

- **Playwright** (fixtures i `playwright-fixture.ts`) för E2E och regressionstester.
- **ESLint** och **TypeScript strict** – inga `any` i produktionskod (kvarvarande är dokumenterade workarounds).
- **Zod** validerar alla forms, inserts, updates och kritiska API-svar.

---

## Deploy

Publicera via Lovable:

1. Öppna [projektet i Lovable](https://lovable.dev/projects/37ca34e8-7a8d-442f-993b-3c47e5f8990d).
2. Klicka **Share → Publish**.

Egen domän: **Project → Settings → Domains → Connect Domain**. Se [dokumentationen](https://docs.lovable.dev/features/custom-domain).

---

## Licens

Proprietär – © Liljeblads. All rights reserved.
