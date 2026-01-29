
# Plan: Förbättra fastighetslistan

## Sammanfattning
Förenkla fastighetssidan genom att ta bort statistikkorten i toppen och förenkla fastighetskorten så de visar endast den viktigaste informationen. Detta gör sidan renare och lättare att skanna.

## Vad som ändras

### 1. Ta bort statistikkorten (rad 192-234)
De tre statistikkorten i toppen tas bort helt:
- "Totalt fastigheter" (redundant - visas redan i headern och som rubrik)
- "Med ritningar" (sekundär info)
- "Totalt våningar" (sekundär info)

### 2. Förenklade fastighetskort
Varje kort kommer visa endast:

| Fält | Beskrivning |
|------|-------------|
| **Namn** | Fastighetens namn (rubrik) |
| **Fastighetsnummer** | Om det finns |
| **Adress** | Med kartikon |
| **LOA** | Lokalarea i m² |

### 3. Vad som tas bort från korten
- ❌ Byggår
- ❌ Typ (Kontor, Bostäder etc.)
- ❌ Area (area_sqm) - behåller endast LOA
- ❌ Energiklass-badge
- ❌ Actionknappar (Arbetsorder, Ritningar, Anteckningar)
- ❌ Edit/Delete knappar (behålls endast delete som hover-state)

### 4. Tabellvyn uppdateras också
Tabellvyn förenklas till samma fält:
- Fastighet (namn + fastighetsnummer)
- Adress
- LOA
- Åtgärder (endast delete)

## Tekniska detaljer

### Fil som ändras

| Fil | Ändring |
|-----|---------|
| `src/pages/Properties.tsx` | Ta bort stats-sektionen, förenkla kort och tabell |

### Kodändringar

**1. Ta bort statistikkort (rad 191-235):**
Hela sektionen med de tre statistikkorten tas bort.

**2. Förenklat kortinnehåll:**
```tsx
<Card 
  key={property.id} 
  className="group cursor-pointer border-border card-hover animate-scale-in"
  style={{ animationDelay: `${0.05 * index}s` }}
  onClick={() => navigate(`/property/${property.id}`)}
>
  <CardHeader className="pb-3">
    <div className="flex items-start justify-between">
      <div className="p-2 rounded-lg bg-primary/10">
        <Building2 className="h-5 w-5 text-primary" />
      </div>
      <Button 
        variant="ghost" 
        size="icon" 
        className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive"
        onClick={(e) => {
          e.stopPropagation();
          setPropertyToDelete(property);
          setDeleteDialogOpen(true);
        }}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
    <CardTitle className="text-xl group-hover:text-primary transition-colors mt-2">
      {property.name}
    </CardTitle>
    {property.property_number && (
      <CardDescription className="text-primary/80 font-mono text-sm">
        {property.property_number}
      </CardDescription>
    )}
  </CardHeader>
  <CardContent className="space-y-2 pt-0">
    {property.address && (
      <div className="flex items-start gap-2 text-sm">
        <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
        <span className="text-muted-foreground">{property.address}</span>
      </div>
    )}
    {property.loa && (
      <div className="text-sm">
        <span className="text-muted-foreground">LOA: </span>
        <span className="font-medium text-foreground">{property.loa} m²</span>
      </div>
    )}
  </CardContent>
</Card>
```

**3. Förenklad tabellvy:**
```tsx
<table className="w-full">
  <thead>
    <tr className="border-b text-sm text-muted-foreground">
      <th className="text-left py-3 px-4 font-medium">Fastighet</th>
      <th className="text-left py-3 px-4 font-medium">Adress</th>
      <th className="text-left py-3 px-4 font-medium">LOA</th>
      <th className="text-left py-3 px-4 font-medium">Åtgärder</th>
    </tr>
  </thead>
  <tbody>
    {filteredProperties.map((property) => (
      <tr key={property.id} className="border-b hover:bg-muted/50 cursor-pointer" onClick={() => navigate(`/property/${property.id}`)}>
        <td className="py-3 px-4">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" />
            <div>
              <div className="font-medium">{property.name}</div>
              {property.property_number && (
                <div className="text-xs text-muted-foreground font-mono">
                  {property.property_number}
                </div>
              )}
            </div>
          </div>
        </td>
        <td className="py-3 px-4">
          {property.address ? (
            <div className="flex items-center gap-2 text-sm">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <span>{property.address}</span>
            </div>
          ) : '-'}
        </td>
        <td className="py-3 px-4 text-sm">
          {property.loa ? `${property.loa} m²` : '-'}
        </td>
        <td className="py-3 px-4">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              setPropertyToDelete(property);
              setDeleteDialogOpen(true);
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </td>
      </tr>
    ))}
  </tbody>
</table>
```

## Visuell jämförelse

**Före (kort):**
```text
┌─────────────────────────────────────┐
│ 🏢  [A]                    [✏️] [🗑️]│
│                                     │
│ Storgatan 1                         │
│ FST-2024-001                        │
├─────────────────────────────────────┤
│ 📍 Storgatan 1, 123 45 Stockholm    │
│ 📅 Byggår: 1985                     │
│ Typ: Kontor                         │
│ LOA: 2500 m²                        │
│ Area: 3000 m²                       │
├─────────────────────────────────────┤
│ [Arbetsorder] [Ritningar] [Anteckn.]│
└─────────────────────────────────────┘
```

**Efter (kort):**
```text
┌─────────────────────────────────────┐
│ 🏢                             [🗑️] │
│                                     │
│ Storgatan 1                         │
│ FST-2024-001                        │
├─────────────────────────────────────┤
│ 📍 Storgatan 1, 123 45 Stockholm    │
│ LOA: 2500 m²                        │
└─────────────────────────────────────┘
```

## Imports som kan tas bort
Följande imports blir oanvända och kan tas bort:
- `Layers` (användes för ritningar-knapp)
- `Wrench` (användes för arbetsorder-knapp)  
- `StickyNote` (användes för anteckningar-knapp)
- `getEnergyGradeColor` (användes för energiklass-badge)

## Fördelar
- Sidan laddar snabbare utan statistik-beräkningar
- Korten blir ~50% kortare och lättare att skanna
- Fokus på identifierande information (namn, nummer, adress, LOA)
- All detaljerad info (byggår, typ, energiklass etc.) finns på detaljsidan
- Renare visuell hierarki
