
# Plan: Förbättra komponentlistan - Uppdaterad

## Sammanfattning
Förenkla komponentkorten så att de visar endast den mest relevanta informationen för snabb scanning. Statusbadgen tas bort och ersätts med installationsår.

## Vad varje kort kommer visa

| Fält | Beskrivning |
|------|-------------|
| **Namn** | Komponentens namn (rubrik) |
| **Typ** | Fullständigt typnamn, t.ex. "SC4.7 Ventsystem" |
| **Fastighet** | Fastighetens namn med ikon |
| **Serienummer** | Om det finns |
| **Regnummer** | Registreringsnummer om det finns |
| **Installationsår** | Om det finns (nytt fält) |

## Vad som tas bort från kortet
- ❌ Statusbadge (active/maintenance/inactive)
- ❌ LastServiceBadge
- ❌ Tillverkare, Modell, Rum
- ❌ FloorSelector
- ❌ QuickServiceButton
- ❌ Alla actionknappar (Service, Detaljer, Ta bort)

## Tekniska detaljer

### Fil som ändras

| Fil | Ändring |
|-----|---------|
| `src/pages/Components.tsx` | Uppdatera kortinnehåll, lägg till typnamn-mappning |

### Kodändringar

**1. Lägg till typnamn-mappning (baserad på useComponentLibrary):**
```typescript
const getTypeDisplayName = (typeCode: string): string => {
  const typeMap: Record<string, string> = {
    'SC1': 'SC1 Styr och övervakningssystem',
    'SC2.1.1': 'SC2.1.1 Takbeläggningar och Tätskikt',
    'SC2.3': 'SC2.3 Entréer Portar mm',
    'SC2.3.1': 'SC2.3.1 Entrépartier Karuselldörrar',
    'SC2.3.3': 'SC2.3.3 Manuella Portar',
    'SC2.3.4': 'SC2.3.4 Maskindrivna Portar',
    'SC2.3.7': 'SC2.3.7 Lastbryggor',
    'SC2.6.2': 'SC2.6.2 Skyddsrum',
    'SC4.1.2.5.1': 'SC4.1.2.5.1 Fettavskiljare',
    'SC4.1.2.5.3': 'SC4.1.2.5.3 Oljeavskiljare',
    'SC4.1.6.9': 'SC4.1.6.9 Fjärrvärmeväxlare',
    'SC4.2.4.6': 'SC4.2.4.6 Port Vertikal',
    'SC4.2.4.7': 'SC4.2.4.7 Port Horisontell',
    'SC4.5.1': 'SC4.5.1 Kylanläggning',
    'SC4.6.2.6': 'SC4.6.2.6 Värmepump',
    'SC4.6.2.6.1': 'SC4.6.2.6.1 Värmeväxlare',
    'SC4.7': 'SC4.7 Ventsystem',
    'SC5.5': 'SC5.5 Reserv eller nödkraftsystem',
    'SC7.1': 'SC7.1 Hiss',
    'SC7.2': 'SC7.2 Rulltrappor och Rullramper',
  };
  return typeMap[typeCode] || typeCode;
};
```

**2. Förenklat kortinnehåll:**
```tsx
<Card
  key={component.id}
  className="group hover:shadow-lg transition-all duration-300 cursor-pointer"
  onClick={() => navigate(`/components/${component.id}`)}
>
  <CardHeader className="pb-2">
    <CardTitle className="text-lg">{component.name}</CardTitle>
    <CardDescription className="text-sm font-medium text-foreground/70">
      {getTypeDisplayName(component.type)}
    </CardDescription>
  </CardHeader>
  <CardContent className="pt-0 space-y-1.5">
    <div className="flex items-center gap-2 text-sm">
      <Building2 className="h-4 w-4 text-primary" />
      <span>{component.property_name || 'Ej kopplad'}</span>
    </div>
    
    {component.serial_number && (
      <div className="text-sm text-muted-foreground">
        Serienr: <span className="font-medium text-foreground">{component.serial_number}</span>
      </div>
    )}
    
    {component.registration_number && (
      <div className="text-sm text-muted-foreground">
        Regnr: <span className="font-medium text-foreground">{component.registration_number}</span>
      </div>
    )}
    
    {component.installation_year && (
      <div className="text-sm text-muted-foreground">
        Installerad: <span className="font-medium text-foreground">{component.installation_year}</span>
      </div>
    )}
  </CardContent>
</Card>
```

## Visuell jämförelse

**Före:**
```text
┌─────────────────────────────────────┐
│ Namn                        [Aktiv] │
│ SC4.7                               │
├─────────────────────────────────────┤
│ ⏰ Senaste service: 2024-01-15      │
│                                     │
│ Tillverkare: Carrier                │
│ Modell: XYZ-123                     │
│ Installerad: 2019                   │
│ Rum: Teknikrum                      │
├─────────────────────────────────────┤
│ 🏢 Fastighet ABC                    │
│ [Välj våning ▼]                     │
├─────────────────────────────────────┤
│ [Service] [Detaljer] [🗑️]           │
└─────────────────────────────────────┘
```

**Efter:**
```text
┌─────────────────────────────────────┐
│ Namn                                │
│ SC4.7 Ventsystem                    │
├─────────────────────────────────────┤
│ 🏢 Fastighet ABC                    │
│ Serienr: ABC-12345                  │
│ Regnr: REG-2024-001                 │
│ Installerad: 2019                   │
└─────────────────────────────────────┘
```

## Fördelar
- Korten blir ~60% kortare och lättare att skanna
- Fokus på identifierande information (serienr, regnr, år)
- Typnamnet blir begripligt utan att behöva kunna koderna
- All detaljerad info (status, service, tillverkare etc.) finns på detaljsidan
- Renare visuell hierarki utan statusbadge
