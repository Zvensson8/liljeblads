

# Plan: Koppla komponenter till arbetsordrar + visa underhållsdata på komponentkort

## Översikt
En kombinerad implementation i tre delar: (1) ny databaskolumn, (2) komponentval i arbetsorder-formulär, (3) visa underhållshistorik och kostnader på komponentkorten/listorna.

---

## Del 1: Databasändring

Lägg till `component_id` i `work_orders`-tabellen:

```sql
ALTER TABLE work_orders 
  ADD COLUMN component_id uuid REFERENCES components(id) ON DELETE SET NULL;
```

Nullable — befintliga arbetsordrar påverkas inte. Inga RLS-ändringar behövs.

---

## Del 2: Komponentval i arbetsorder-formulär

**Filer:** `WorkOrderDialog.tsx`, `WorkOrderDetailDialog.tsx`

- Lägg till `component_id` (optional) i Zod-schemat
- Hämta komponenter filtrerat på vald `property_id` (reaktiv query)
- Visa dropdown "Komponent (valfritt)" efter att fastighet valts
- Rensa komponentval om fastighet ändras
- Inkludera `component_id` i insert/update-payload
- Visa kopplad komponent i detaljvyn (`WorkOrderDetailDialog`)

---

## Del 3: Underhållshistorik och kostnader på komponentkort

**Filer:** `Components.tsx`, `ComponentDetail.tsx`

### Components.tsx (listan)
- Hämta aggregerad underhållsdata: `SELECT component_id, SUM(cost), COUNT(*), MAX(performed_date) FROM maintenance_history GROUP BY component_id`
- Hämta arbetsordrar kopplade till komponenter: `SELECT component_id, COUNT(*), SUM(price) FROM work_orders WHERE component_id IS NOT NULL GROUP BY component_id`
- **Kortvyn**: Visa senaste service, total underhållskostnad, antal arbetsordrar
- **Tabellvyn**: Lägg till kolumn "Underhållskostnad"
- **Kostnadsöversikt-fliken**: Ersätt placeholder med sorterad lista (högst kostnad först)

### ComponentDetail.tsx
- Lägg till en sektion/flik som visar arbetsordrar kopplade till komponenten
- Visa total kostnad (maintenance_history + work_orders) i en sammanfattningsrad

---

## Tekniska detaljer

- Komponentquery i arbetsorder-dialog: `supabase.from('components').select('id, name, type').eq('property_id', selectedPropertyId)`
- `useEffect` som rensar `component_id` när `property_id` ändras
- Underhållsdata aggregeras klientsidigt efter en enda query per tabell
- Inga nya tabeller eller RLS-policies behövs

