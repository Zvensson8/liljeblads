# Quick wins-plan: Systemförbättringar

8 riktade insatser med hög ROI, grupperade per fokusområde. Kan levereras i två arbetsdagar.

---

## 1. Kodkvalitet & arkitektur

### 1.1 Global ErrorBoundary med Sentry-liknande fallback
`ErrorBoundary` finns redan men wrappar bara hela appen. Lägg till per-route boundaries via en `<RouteErrorBoundary>` som visar ett vänligt felkort ("Något gick fel — försök igen") istället för vit skärm när en enskild sida kraschar. Loggar till `console.error` + `audit_logs`.

### 1.2 Städa upp de sista 11 `any`
Ersätt de återstående `TS2589`-workarounds med smalare hjälptyper (t.ex. `SupabaseInsert<T>` wrapper) så att `noImplicitAny` kan aktiveras i `tsconfig`. Låser fast typedisciplinen framåt.

### 1.3 Central `useEdgeFunction`-felhantering
Idag toast:ar varje anropande komponent själv. Centralisera i `useEdgeFunctions.tsx`: standardiserad felparser (`getErrorMessage` + statuskodmappning: 401 → "Sessionen har gått ut", 429 → "För många försök", 500 → "Serverfel"). Alla nuvarande edge-hooks ärver detta.

---

## 2. Prestanda & skalbarhet

### 2.1 Slow-query-audit + indexering
Kör `slow_queries` mot produktionsdatan, identifiera de 3–5 tyngsta queries. Sannolika kandidater baserat på schemat:
- `property_todos` filtrerad på `(organization_id, completed, due_date)`
- `work_orders` filtrerad på `(property_id, status)`
- `maintenance_history` filtrerad på `(component_id, service_date DESC)`

Skapa saknade sammansatta index via migration.

### 2.2 Route-level prefetch på hover
Dashboard, Properties och Operations navigerar tungt. Lägg en `useHoverPrefetch(route)` som anropar `queryClient.prefetchQuery` när användaren hovrar en länk/kort i >150 ms. Ger upplevd instant-navigation utan bundle-kostnad.

### 2.3 Aktivera `refetchOnWindowFocus` selektivt
Globalt `false` idag (bra för formulär). Slå på för specifika keys som förändras ofta serverside: `notifications`, `workOrders.lists()`, `driftTasks.lists()`. Färskare data utan att störa öppna formulär.

---

## 3. UX & design

### 3.1 Ångra-toast för destruktiva åtgärder
Ta bort-actions (todo, work order, component, document) triggar direkt `DELETE` idag. Byt till Sonner-toast med "Ångra" (5 s). Wrappa i en `useUndoableMutation`-hook som håller optimistic-remove i cache och skickar mutation vid timeout. Räddar många oavsiktliga klick, särskilt på mobil.

### 3.2 Global command palette (⌘K) utökad
`GlobalSearchDialog` finns men söker bara entiteter. Utöka med **actions**: "Skapa fastighet", "Ny arbetsorder", "Exportera XLSX", "Byt organisation", "Logga ut". Grupperas som "Snabbåtgärder" ovanför sökträffar. Nollkost för navigation via tangentbord.

---

## 4. Ny funktion

### 4.1 "Mina uppgifter idag" — samlad startvy
Ett widget-kort på Dashboard som aggregerar över alla fastigheter för inloggad användare:
- Todos med `due_date <= today` och `completed = false`
- Work orders där `assigned_to = user` med status `pending`/`in_progress`
- Drift-tasks som förfaller denna vecka

Klick öppnar detaljvyn direkt. Använder befintliga hooks — ingen ny DB-yta.

---

## Tekniska detaljer

### Nya filer
- `src/components/RouteErrorBoundary.tsx`
- `src/hooks/useHoverPrefetch.ts`
- `src/hooks/useUndoableMutation.ts`
- `src/components/dashboard/MyTasksTodayWidget.tsx`

### Ändrade filer
- `src/App.tsx` — wrappa `<Route>` med `RouteErrorBoundary`
- `src/hooks/useEdgeFunctions.tsx` — central felmappning
- `src/lib/queryClient.ts` — per-key `refetchOnWindowFocus`
- `src/components/GlobalSearchDialog.tsx` — actions-sektion
- `src/pages/Dashboard.tsx` — registrera nytt widget
- `tsconfig.app.json` — `noImplicitAny: true` efter 1.2
- Ny migration: index på `property_todos`, `work_orders`, `maintenance_history`

### Genomförandeordning
Går att köra i följd utan mellanliggande "fortsätt":
1. Kodkvalitet (1.1 → 1.2 → 1.3)
2. Prestanda (2.1 index → 2.2 prefetch → 2.3 focus)
3. UX (3.1 undo → 3.2 palette)
4. Ny funktion (4.1 widget)

Bygget verifieras efter varje grupp; TypeScript + lint körs automatiskt.
