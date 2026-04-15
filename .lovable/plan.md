

# Plan: Auto-registrera underhåll vid avslutad arbetsorder + kostnadsdialog

## Översikt
När en arbetsorder markeras som "Slutförd" ska systemet:
1. Visa en dialog som frågar om kostnad (frivilligt) innan statusändringen sparas
2. Automatiskt skapa en post i `maintenance_history` kopplad till arbetsorderns komponent (om en komponent är kopplad)

## Nuläge
- `WorkOrderDetailDialog.tsx` sparar statusändringar via `onSubmit` (rad 253) — ingen koppling till `maintenance_history`
- `maintenance_history` har kolumner: `component_id`, `action_type`, `performed_date`, `supplier`, `cost`, `notes`, `category`
- Det finns ingen `work_order_id` i `maintenance_history` — behövs för att länka

## Steg

### 1. Databasändring
Lägg till `work_order_id` i `maintenance_history` för att spåra vilken underhållspost som skapats från en arbetsorder:
```sql
ALTER TABLE maintenance_history 
  ADD COLUMN work_order_id uuid REFERENCES work_orders(id) ON DELETE SET NULL;
```

### 2. Ny dialog: "Slutför arbetsorder"
I `WorkOrderDetailDialog.tsx`, när status ändras till `completed`:
- Fånga upp statusändringen **innan** den sparas
- Visa en dialog med:
  - Bekräftelsetext: "Vill du registrera en kostnad för denna arbetsorder?"
  - Fält för kostnad (förifylt med `workOrder.price` om det finns)
  - "Hoppa över" och "Spara & slutför"-knappar
- Dialogen visas **bara om** en komponent är kopplad (`component_id` finns)
- Om ingen komponent är kopplad — slutför direkt utan dialog

### 3. Automatisk maintenance_history-post
När användaren bekräftar slutförandet (med eller utan kostnad):
- Skapa en ny rad i `maintenance_history`:
  - `component_id` = arbetsorderns `component_id`
  - `action_type` = arbetsorderns `action`
  - `performed_date` = dagens datum
  - `supplier` = arbetsorderns `contractor`
  - `cost` = inmatad kostnad (eller `null`)
  - `notes` = arbetsorderns `comments`
  - `category` = `'planned'`
  - `work_order_id` = arbetsorderns `id`
- Spara sedan statusändringen som vanligt

### 4. Visa koppling i ComponentDetail
I arbetsorder-fliken på komponentdetaljen — arbetsordrar med status "completed" som har en `maintenance_history`-post syns redan via underhållshistoriken. Lägg till en länk/badge i underhållshistoriken som visar "Från arbetsorder" om `work_order_id` finns.

## Tekniska detaljer
- **Filer som ändras**: `WorkOrderDetailDialog.tsx`, `ComponentDetail.tsx`
- **Migration**: En kolumn (`work_order_id`)
- Kanban-vyn (`WorkOrderKanban.tsx`) bör också fånga upp drag-to-completed och visa dialogen — men det kan hanteras i nästa steg
- Triggern `update_drift_task_on_maintenance_insert` körs automatiskt om `drift_task_id` sätts

