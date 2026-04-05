
## Plan: AI Chatt med kunskapsbas & beställningsflöde

### 1. Databas: Kunskapsbas-tabell
- Skapa `knowledge_base_chunks`-tabell med vektorkolumn för embeddings
- Skapa `match_knowledge_base_chunks` RPC-funktion för semantisk sökning
- RLS-policies (läsbar av alla autentiserade, skrivbar av admin/founder)

### 2. Edge function: `ingest-knowledge-base`
- Ta emot text (t.ex. ABT06), chunka och embeda med Google Gemini Embeddings
- Stöd för batch-ingest av stora dokument
- Skyddad: kräver admin/founder-roll

### 3. Uppgradera `ai-chat` edge function
- Lägg till kunskapsbas-RAG (söker i `knowledge_base_chunks` parallellt med befintlig embedding-sökning)
- Uppdatera systemprompt med fokus på fastighetsförvaltning, ABT06, och entreprenadavtal
- Behåll befintlig data-kontext (properties, components, work orders, etc.)

### 4. Uppgradera AI Chat-sidan (`src/pages/AIChat.tsx`)
- Streaming med SSE (token-by-token rendering)
- Markdown-rendering med `react-markdown`
- Föreslagna frågor
- Förbättrat UI med chat-bubblor

### 5. Uppdatera beställningsflödet
- Uppdatera `generate-order-text` och `generate-project-order-text` edge functions att söka ABT06 i kunskapsbasen
- Referera till relevanta ABT06-paragrafer i genererade texter

### 6. Admin-verktyg för kunskapsbas
- Enkel UI i FounderAdmin för att ladda upp/hantera kunskapsbastexter
