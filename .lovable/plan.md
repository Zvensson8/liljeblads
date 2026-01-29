
# Plan: Förbättra Arbetsordrar-sidan

## Sammanfattning
Förenkla arbetsordersidan genom att slå ihop de tre separata tabellerna till en enda tabell, minska antalet kolumner, flytta filter till en popover, och ta bort onödiga knappar. Prioritet visas som färgindikator på raden istället för en egen kolumn.

## Vad som ändras

### 1. En enda tabell istället för tre
De tre separata tabellerna (Ej påbörjad, Inväntar offert, Beställt) slås ihop till en enda tabell.

### 2. Färre kolumner

| Före (9 kolumner) | Efter (5 kolumner) |
|-------------------|-------------------|
| Fastighet | Åtgärd |
| Åtgärd | Fastighet |
| Entreprenör | Status |
| Pris | Pris |
| Datum | Datum |
| Prioritet | _(borttagen - visas som färgindikator)_ |
| Kvartal | _(borttagen - finns på detaljsidan)_ |
| Status | |
| Åtgärder | _(borttagen - klick på rad)_ |

### 3. Prioritet som färgindikator
Istället för en egen kolumn visas prioritet som en färgad vänsterkant på varje rad:
- **Hög prioritet**: Röd kant (`border-l-4 border-l-red-500`)
- **Medel prioritet**: Gul kant (`border-l-4 border-l-yellow-500`)
- **Låg prioritet**: Grön kant (`border-l-4 border-l-green-500`)

### 4. Kompaktare filter
Filtren flyttas till en "Filter"-knapp som öppnar en Popover istället för att ta upp en hel rad.

### 5. Interaktioner
- **Klick på rad** → Öppnar detaljdialog
- **Klick på Status** → Inline-redigering (behålls)
- **Klick på Pris** → Inline-redigering (behålls)
- **Ta bort Edit/Delete-knappar** → Redigering sker i detaljdialogen

## Tekniska detaljer

### Fil som ändras

| Fil | Ändring |
|-----|---------|
| `src/pages/WorkOrders.tsx` | En tabell, färre kolumner, filter i popover, färgindikator för prioritet |

### Imports som läggs till
```tsx
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Filter } from "lucide-react";
```

### Imports som tas bort
```tsx
// Edit2 behövs inte längre (ingen edit-knapp)
import { Edit2 } from "lucide-react";
```

### Ny renderOrdersTable-funktion
Funktionen förenklas och visar alla ordrar i en enda tabell:

```tsx
const renderOrdersTable = () => {
  const allFilteredOrders = filteredOrders(workOrders || []);
  
  const getPriorityBorderColor = (priority: string) => {
    const colors = {
      high: "border-l-red-500",
      medium: "border-l-yellow-500",
      low: "border-l-green-500",
    };
    return colors[priority as keyof typeof colors] || "border-l-transparent";
  };

  return (
    <Card className="border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-medium">
          Arbetsordrar
        </CardTitle>
        <div className="text-sm text-muted-foreground">
          {allFilteredOrders.length} ordrar
        </div>
      </CardHeader>
      <CardContent>
        {allFilteredOrders.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
            Inga arbetsordrar
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b text-sm text-muted-foreground">
                  <th className="text-left py-3 px-3 font-medium">Åtgärd</th>
                  <th className="text-left py-3 px-3 font-medium">Fastighet</th>
                  <th className="text-left py-3 px-3 font-medium">Status</th>
                  <th className="text-left py-3 px-3 font-medium">Pris</th>
                  <th className="text-left py-3 px-3 font-medium">Datum</th>
                </tr>
              </thead>
              <tbody>
                {allFilteredOrders.map((order) => (
                  <tr 
                    key={order.id} 
                    className={`border-b border-l-4 ${getPriorityBorderColor(order.priority)} hover:bg-muted/50 cursor-pointer`}
                    onClick={() => {
                      setDetailOrder(order);
                      setDetailDialogOpen(true);
                    }}
                  >
                    <td className="py-3 px-3 font-medium">{order.action}</td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">🏢</span>
                        <span>{order.properties?.name}</span>
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      {/* Inline status editing - behålls */}
                    </td>
                    <td className="py-3 px-3">
                      {/* Inline pris editing - behålls */}
                    </td>
                    <td className="py-3 px-3">
                      {order.due_date
                        ? format(new Date(order.due_date), "yyyy-MM-dd", { locale: sv })
                        : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
```

### Filter i Popover
```tsx
<Popover>
  <PopoverTrigger asChild>
    <Button variant="outline" size="sm" className="h-9">
      <Filter className="h-4 w-4 mr-2" />
      Filter
      {activeFilterCount > 0 && (
        <Badge variant="secondary" className="ml-2 h-5 w-5 p-0 flex items-center justify-center text-xs">
          {activeFilterCount}
        </Badge>
      )}
    </Button>
  </PopoverTrigger>
  <PopoverContent className="w-80 p-4" align="start">
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="font-medium">Filter</h4>
        {activeFilterCount > 0 && (
          <Button variant="ghost" size="sm" onClick={clearAllFilters}>
            Rensa alla
          </Button>
        )}
      </div>
      
      <div className="space-y-3">
        <div>
          <label className="text-sm text-muted-foreground mb-1.5 block">Fastighet</label>
          <Select value={selectedProperty} onValueChange={setSelectedProperty}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Alla fastigheter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alla fastigheter</SelectItem>
              {uniqueProperties.map((property) => (
                <SelectItem key={property} value={...}>
                  {property}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        <div>
          <label className="text-sm text-muted-foreground mb-1.5 block">Entreprenör</label>
          <Select value={selectedContractor} onValueChange={setSelectedContractor}>
            ...
          </Select>
        </div>
        
        <div>
          <label className="text-sm text-muted-foreground mb-1.5 block">Status</label>
          <Select value={selectedStatus} onValueChange={setSelectedStatus}>
            ...
          </Select>
        </div>
      </div>
    </div>
  </PopoverContent>
</Popover>
```

## Visuell jämförelse

**Före:**
```text
┌─────────────────────────────────────────────────────────────────────────────────┐
│ Filter: [Alla fastigheter ▼] [Alla entreprenörer ▼] [Alla statusar ▼] [Rensa]  │
└─────────────────────────────────────────────────────────────────────────────────┘

┌─ Ej påbörjad ─────────────────────────────────────────────────────────────────┐
│ Fastighet │ Åtgärd │ Entreprenör │ Pris │ Datum │ Prioritet │ Kvartal │ Status │ Åtgärder │
├───────────┼────────┼─────────────┼──────┼───────┼───────────┼─────────┼────────┼──────────┤
│ ...       │ ...    │ ...         │ ...  │ ...   │ [Medel]   │ Q2      │ [...]  │ [✏️][🗑️]│
└───────────────────────────────────────────────────────────────────────────────────────────┘

┌─ Inväntar offert ─────────────────────────────────────────────────────────────┐
│ (samma 9 kolumner igen)                                                        │
└───────────────────────────────────────────────────────────────────────────────┘

┌─ Beställt ────────────────────────────────────────────────────────────────────┐
│ (samma 9 kolumner igen)                                                        │
└───────────────────────────────────────────────────────────────────────────────┘
```

**Efter:**
```text
[🔍 Sök...] [Filter (2)] [Arkiverade] [+ Ny Arbetsorder]

┌─ Arbetsordrar (12 ordrar) ────────────────────────────────────────┐
│ Åtgärd           │ Fastighet      │ Status           │ Pris    │ Datum      │
├──────────────────┼────────────────┼──────────────────┼─────────┼────────────┤
│ ▌Byt filter      │ 🏢 Storgatan 1 │ [Ej påbörjad ▼]  │ -       │ 2024-03-15 │  ← röd kant (hög)
│ ▌Serva ventil    │ 🏢 Parkvägen 5 │ [Beställt ▼]     │ 5 400 kr│ 2024-03-20 │  ← gul kant (medel)
│ ▌Rengöring       │ 🏢 Storgatan 1 │ [Inväntar ▼]     │ -       │ 2024-04-01 │  ← grön kant (låg)
└─────────────────────────────────────────────────────────────────────────────────┘
```

## Fördelar
- Sidan blir enklare att skanna (en tabell, färre kolumner)
- Prioritet syns direkt visuellt utan att ta plats
- Filter tar mindre plats men är fortfarande lättillgängliga
- Färre klick för att navigera (klick på rad istället för edit-knapp)
- Fokus på viktig info: Åtgärd, Fastighet, Status, Pris, Datum
