

# Plan: AI-beställningstext, E-postutskick & Projektkoppling

## Översikt

Tre funktioner implementeras:
1. **AI-genererad beställningstext + förhandsgranskning** — Ett preview-steg i arbetsorderdetaljvyn där AI genererar en beställningstext som kan redigeras innan skickning
2. **E-postutskick till användaren** — Skickar den genererade/redigerade texten som e-post (till inloggad användares e-post, som idag)
3. **Koppla arbetsordrar till projekt** — Möjlighet att skapa arbetsordrar inifrån ett projekt och se kopplade ordrar

---

## Steg 1: Databasändring — Lägg till `project_id` på `work_orders`

Ny migration:
```sql
ALTER TABLE work_orders ADD COLUMN project_id uuid REFERENCES projects(id) ON DELETE SET NULL;
CREATE INDEX idx_work_orders_project_id ON work_orders(project_id);
```

---

## Steg 2: Edge Function — `generate-order-text`

Ny edge function som tar emot `workOrderId`, hämtar arbetsorder + fastighets- och kontaktdata, och anropar Gemini (via Lovable AI gateway) för att generera en professionell beställningstext på svenska.

Returnerar genererad text som JSON.

---

## Steg 3: Ny komponent — `WorkOrderPreviewSheet`

En sheet/dialog som öppnas från arbetsorderdetaljvyn:
- Knappen "Skicka beställningsutkast" öppnar sheeten istället för att direkt skicka
- Sheeten visar: "Generera med AI"-knapp → laddar AI-text → visar i redigerbar textarea
- Användaren kan redigera texten fritt
- Två knappar: "Skicka till min e-post" och "Avbryt"

---

## Steg 4: Uppdatera `send-work-order-draft` edge function

Ändra befintliga edge functionen så den accepterar en valfri `customText`-parameter. Om `customText` skickas med, används den istället för den hårdkodade mallen. E-postens HTML wrappar texten med enkel formatering.

---

## Steg 5: Koppla arbetsordrar till projekt

**WorkOrderDialog** — Lägg till valfritt `project_id`-fält (dropdown med projekt på samma fastighet). Skickas med vid insert/update.

**ProjectDetail** — Ny tab eller sektion under "Översikt" som visar kopplade arbetsordrar med möjlighet att:
- Se lista på kopplade arbetsordrar
- Skapa ny arbetsorder direkt kopplad till projektet (öppnar WorkOrderDialog med `project_id` förifyllt)

Ny komponent `ProjectWorkOrders` som visar tabell med status, åtgärd, pris och länk till detalj.

---

## Tekniska detaljer

**Filer som skapas:**
- `supabase/functions/generate-order-text/index.ts` — AI-textgenerering via Lovable AI (Gemini)
- `src/components/WorkOrderPreviewSheet.tsx` — Preview + redigering + skicka
- `src/components/projects/ProjectWorkOrders.tsx` — Lista kopplade arbetsordrar

**Filer som ändras:**
- `src/components/WorkOrderDetailDialog.tsx` — Byt ut direktskicka-knappen mot preview-sheet
- `src/components/WorkOrderDialog.tsx` — Lägg till valfritt project_id-fält
- `supabase/functions/send-work-order-draft/index.ts` — Stöd för customText
- `src/pages/ProjectDetail.tsx` — Ny tab "Arbetsordrar"

**Databas:**
- Migration: `project_id uuid` på `work_orders`

