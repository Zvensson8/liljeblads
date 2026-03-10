

# Plan: Bygg om AI-chatten från grunden

## Problem identifierade

1. **CORS-headers ofullständiga** — Edge-funktionen saknar `x-supabase-client-platform`, `x-supabase-client-platform-version`, `x-supabase-client-runtime`, `x-supabase-client-runtime-version` i `Access-Control-Allow-Headers`, vilket gör att webbläsaren blockerar anrop.

2. **Edge-funktionen är 1162 rader** — Allt från autentisering, kontexthämtning, sökning, verktygsanrop och AI-gateway i en enda funktion. Svårt att felsöka.

3. **Embedding-API anropas fel** — `text-embedding-3-small` är inte en modell som Lovable AI Gateway stöder (den har chat/completions, inte embeddings). Detta gör att semantisk sökning troligen misslyckas tyst.

4. **ThemeProvider runtime-error** — Det finns ett aktivt fel (`useTheme must be used within ThemeProvider`) som kraschar appen. Troligen en stale import i `ErrorBoundary` eller liknande som renderas utanför providern. Behöver undersökas.

5. **Streaming- och non-streaming-logik blandas** — Retry-logiken med `withRetry` runt `makeAIRequest` returnerar antingen en `Response`-objekt (vid 429/402) eller gateway-svar, vilket skapar typförvirring.

## Åtgärdsplan

### 1. Fixa CORS-headers i edge-funktionen
Uppdatera `corsHeaders` till den fullständiga versionen med alla Supabase-klient-headers.

### 2. Förenkla och stabilisera edge-funktionen
Refaktorera `ai-chat/index.ts` till en renare struktur:
- **Auth** → Använd `getClaims()` istället för `getUser()` (snabbare, korrekt enligt docs)
- **Kontext** → Behåll organisationsöversikt + databasuppslag, men ta bort det trasiga embedding-anropet (semantisk sökning via `semantic_search_ranked` kräver en fungerande embedding — vi kan inte använda `ai.gateway.lovable.dev/v1/embeddings`)
- **AI-anrop** → Ren separation mellan streaming och icke-streaming svar
- **Felhantering** → Tydligare 429/402/401/500 responses med korrekta CORS-headers

### 3. Fixa kontexthämtningen
Istället för det trasiga embedding-anropet:
- Hämta relevant data via direkta databasuppslag (redan implementerat som fallback)
- Behåll de keyword-baserade sökningarna som fungerar
- Om `semantic_search_ranked` ska användas i framtiden behöver embeddings genereras separat (vilket redan görs via `generate-embeddings`-funktionen), men vi behöver en fungerande embeddings-modell

### 4. Fixa ThemeProvider-felet
Undersök var `ThemeToggle` renderas utanför `ThemeProvider`. Baserat på koden ser det korrekt ut (`AppSidebar` → inuti `App` → inuti `ThemeProvider`), men `ErrorBoundary` wrappas *utanför* `ThemeProvider`. Om `ErrorBoundary` renderar en fallback som importerar `ThemeToggle`, uppstår felet. Lägg till en try-catch eller flytta `ThemeProvider` utanför `ErrorBoundary`.

### 5. Uppdatera frontend-felhantering
- Hantera 429 och 402 med tydliga toast-meddelanden
- Bättre visning av felmeddelanden i chatten

## Filer som ändras

| Fil | Ändring |
|---|---|
| `supabase/functions/ai-chat/index.ts` | Omskriven: fixad CORS, `getClaims()`, borttaget trasigt embedding-anrop, renare struktur |
| `src/components/ai-chat/AIChatDialog.tsx` | Uppdaterad CORS-kompatibel anropslogik |
| `src/App.tsx` | Flytta `ThemeProvider` utanför `ErrorBoundary` |
| `src/hooks/useTheme.tsx` | Lägg till en fallback som inte kastar om context saknas |

## Teknisk sammanfattning

Huvudproblemet är sannolikt CORS + det trasiga embedding-anropet som gör att edge-funktionen kraschar eller returnerar fel. Lösningen är att fixa CORS-headers, ta bort det trasiga embedding-anropet, använda `getClaims()` för auth, och säkerställa att ThemeProvider wrappas korrekt.

