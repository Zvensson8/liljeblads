
# Plan: Förbättra Driftuppföljning

## Sammanfattning
Fem förbättringar för att göra Driftuppföljning enklare och snabbare att använda:
1. Aktivera Årsöversikten med visuella cirkeldiagram
2. Kompaktare kvartalsvy med grid-layout på desktop
3. Nytt "Snabbrapportera"-läge för effektiv inmatning
4. Mobilanpassning med kort-layout och swipe-gester
5. Förbättrad Dashboard-widget med trendpilar

---

## 1. Aktivera Årsöversikten

### Vad ändras
Den befintliga `YearOverview`-komponenten aktiveras och kopplas till riktiga data. Just nu visar fliken bara "Välj ett kvartal ovan för att se detaljer".

### Resultat
- Fyra klickbara kvartalskort med cirkeldiagram
- Färgkodning: Grön (80%+), Gul (40-79%), Röd (<40%)
- Klick på ett kvartal scrollar till och öppnar det kvartalet

---

## 2. Kompaktare kvartalsvy (Desktop)

### Vad ändras
På desktop (lg+) visas kvartalen i ett 2x2 grid istället för vertikalt staplade. Varje kvartals-header blir mer kompakt med inline-statistik.

### Före
```text
┌─ Q1 ──────────────────────────────┐
│ (hela skärmens bredd)             │
└───────────────────────────────────┘
┌─ Q2 ──────────────────────────────┐
│ (hela skärmens bredd)             │
└───────────────────────────────────┘
... (scrollar långt nedåt)
```

### Efter
```text
┌─ Q1 ────────────────┐  ┌─ Q2 ────────────────┐
│ Kompakt header      │  │ Kompakt header      │
│ ▶ Expandera         │  │ ▶ Expandera         │
└─────────────────────┘  └─────────────────────┘
┌─ Q3 ────────────────┐  ┌─ Q4 ────────────────┐
│ Kompakt header      │  │ Kompakt header      │
│ ▶ Expandera         │  │ ▶ Expandera         │
└─────────────────────┘  └─────────────────────┘
```

---

## 3. Snabbrapportera-läge

### Vad ändras
En ny flik "Snabbrapportera" läggs till som visar en fokuserad lista med **endast** uppgifter som saknar rapportering (reported_count < planned_count).

### Funktioner
- Platt lista utan att behöva expandera kvartal
- Checkbox för att markera som klar med ett klick
- Siffror visar "X av Y" för varje uppgift
- Filtrering per kvartal eller alla

### Gränssnitt
```text
┌─ Snabbrapportera ─────────────────────────────────────────┐
│ [Q1] [Q2] [Q3] [Q4] [Alla]                               │
├───────────────────────────────────────────────────────────┤
│ ☐ Byte av filter (Q1)                    0 / 5 objekt    │
│ ☐ Inspektion ventiler (Q1)               2 / 10 objekt   │
│ ☐ Rengöring fläktar (Q2)                 0 / 3 objekt    │
│ ☑ Service värmepump (Q2)                 4 / 4 objekt    │
└───────────────────────────────────────────────────────────┘
```

---

## 4. Mobilanpassning

### Vad ändras
På mobil (sm och mindre) ersätts tabellen med ett kort-baserat gränssnitt som använder `SwipeableCard`.

### Funktioner
- Varje uppgift visas som ett kort
- Swipe vänster → Ta bort
- Swipe höger → Markera som klar
- Kompakt info: Namn, status-badge, "X/Y objekt"
- Expanderbar för att se länkade objekt

### Kort-layout (mobil)
```text
┌────────────────────────────────────────┐
│ Byte av filter                  [Kvar] │
│ 2 / 5 objekt                    ▼      │
├────────────────────────────────────────┤
│ [Swipe: ← Ta bort | → Markera klar]   │
└────────────────────────────────────────┘
```

---

## 5. Förbättrad Dashboard-widget

### Vad ändras
`OperationsProgress`-widgeten får trendpilar och en mini-sammanfattning per kvartal.

### Nya funktioner
- Trendpil (↑/↓) baserad på förra veckans data
- 4 små staplar som visar alla kvartals status
- "Saknas att rapportera: X uppgifter" som snabb-länk

### Före
```text
┌─ Driftuppgifter - Q1 2026 ────────────┐
│ Uppgifter slutförda         65%       │
│ ████████░░░░░                         │
│ 13 av 20 uppgifter                    │
│                                        │
│ Objekt rapporterade         45%       │
│ █████░░░░░░░░░                        │
│ 45 av 100 objekt                      │
└────────────────────────────────────────┘
```

### Efter
```text
┌─ Driftuppgifter - Q1 2026 ────────────┐
│ Uppgifter slutförda     ↑ 65%         │
│ ████████░░░░░                         │
│ 13 av 20 uppgifter (+3 denna vecka)   │
│                                        │
│ ┌──┐ ┌──┐ ┌──┐ ┌──┐                   │
│ │Q1│ │Q2│ │Q3│ │Q4│  (mini-staplar)   │
│ └──┘ └──┘ └──┘ └──┘                   │
│                                        │
│ ⚠ 7 uppgifter saknar rapportering     │
│ [Visa alla driftuppgifter]            │
└────────────────────────────────────────┘
```

---

## Tekniska detaljer

### Filer som ändras

| Fil | Ändring |
|-----|---------|
| `src/pages/Operations.tsx` | Lägg till ny flik "Snabbrapportera", grid-layout för kvartal, aktivera YearOverview |
| `src/components/operations/QuarterCard.tsx` | Mobilanpassning med kort-layout, kompaktare header |
| `src/components/operations/YearOverview.tsx` | Koppla till live-data, klickbara kvartal |
| `src/components/dashboard/OperationsProgress.tsx` | Trendpilar, mini-kvartalsstaplar, varning för saknade |
| `src/components/operations/QuickReportView.tsx` | **NY FIL** - Snabbrapportera-komponenten |

### Imports som läggs till
```tsx
// Operations.tsx
import { QuickReportView } from "@/components/operations/QuickReportView";
import { YearOverview } from "@/components/operations/YearOverview";

// QuarterCard.tsx
import { SwipeableCard } from "@/components/SwipeableCard";
import { useIsMobile } from "@/hooks/use-mobile";
```

### Ny QuickReportView-komponent
```tsx
interface QuickReportViewProps {
  propertyId: string;
  year: number;
}

export function QuickReportView({ propertyId, year }: QuickReportViewProps) {
  const [quarterFilter, setQuarterFilter] = useState<string>("all");
  const [tasks, setTasks] = useState<Task[]>([]);
  
  // Hämta endast uppgifter med reported_count < planned_count
  // Visa som enkel lista med checkbox för snabb markering
}
```

### QuarterCard mobilvy
```tsx
// I QuarterCard.tsx
const isMobile = useIsMobile();

// Render-logik:
{isMobile ? (
  <div className="space-y-2">
    {filteredTasks.map((task) => (
      <SwipeableCard
        key={task.id}
        onSwipeLeft={() => handleDeleteTask(task.id)}
        onSwipeRight={() => handleMarkComplete(task.id)}
      >
        <TaskMobileCard task={task} />
      </SwipeableCard>
    ))}
  </div>
) : (
  <Table>
    {/* Befintlig tabell */}
  </Table>
)}
```

### OperationsProgress trendberäkning
```tsx
// Hämta förra veckans data för jämförelse
const { data: lastWeekTasks } = await supabase
  .from('drift_tasks')
  .select('reported_count')
  .eq('year', currentYear)
  .eq('quarter', currentQuarter)
  .lt('updated_at', oneWeekAgo);

// Beräkna trend
const trend = currentCompleted - lastWeekCompleted;
const trendIcon = trend > 0 ? "↑" : trend < 0 ? "↓" : "→";
```

---

## Prioritering

| Steg | Funktion | Komplexitet |
|------|----------|-------------|
| 1 | Aktivera Årsöversikten | Låg |
| 2 | Grid-layout för kvartal | Låg |
| 3 | Dashboard-widget förbättring | Medel |
| 4 | Snabbrapportera-läge | Medel |
| 5 | Mobilanpassning | Medel-Hög |

---

## Fördelar

- **Årsöversikt**: Snabb visuell överblick utan att scrolla
- **Grid-layout**: Halverar vertikal scrollning på desktop
- **Snabbrapportera**: Fokuserad vy för att "klara av" uppgifter
- **Mobilanpassning**: Naturlig touch-interaktion med swipe
- **Dashboard**: Proaktiv varning om saknade rapporter
