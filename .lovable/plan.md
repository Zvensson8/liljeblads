

# Plan: Förbättra Projektmodulen

## Sammanfattning
En omfattande uppgradering av projektmodulen för att göra den mer effektiv och användarvänlig - både i projektlistan och inne i enskilda projekt.

---

## Nuvarande utmaningar

### Projektlistan (`Projects.tsx`)
- Dashboard visas inte - bara projektlista och filter
- Mycket vertikal scrollning för att se alla projekt
- Ingen snabb överblick av projektstatus

### Projektdetalj (`ProjectDetail.tsx`)
- 6 flikar som kräver mycket klickande
- KPI-kort högst upp visar bara siffror utan kontext
- Headern har för många knappar som gömmer sig på mobil
- Checklistan har ingen prioritering eller gruppering
- Ekonomifliken kräver två klick för att se kostnader

---

## Förbättringar

### 1. Projektlista - Dashboard-vy

**Vad ändras:**
Lägg till en "Översikt"-flik som standard som visar `ProjectDashboard`-komponenten (som redan finns men inte används).

**Resultat:**
```text
┌─ Projekt ─────────────────────────────────────────────────┐
│ [Översikt] [Aktiva projekt] [Förslag] [Arkiverade]       │
├───────────────────────────────────────────────────────────┤
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐     │
│  │ 12       │ │ 4.2M kr  │ │ 3.8M kr  │ │ 2        │     │
│  │ Projekt  │ │ Budget   │ │ Utfall   │ │ Varning  │     │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘     │
│                                                           │
│  ┌─────────────────────┐  ┌─────────────────────────────┐│
│  │ Projekt per status  │  │ Projekt per typ             ││
│  └─────────────────────┘  └─────────────────────────────┘│
└───────────────────────────────────────────────────────────┘
```

---

### 2. Projektdetalj - Ny startsida

**Vad ändras:**
Ersätt "Information"-fliken med en kombinerad överblick som visar det viktigaste direkt.

**Ny layout:**
```text
┌─ Projektöversikt ─────────────────────────────────────────┐
│                                                           │
│  ┌─ Ekonomi ─────────┐  ┌─ Framsteg ─────────────────┐   │
│  │ Budget: 500k      │  │ Checklista: ████████░░ 80% │   │
│  │ Utfall: 380k      │  │ 8 av 10 punkter klara      │   │
│  │ Prognos: 520k     │  │                            │   │
│  │                   │  │ Nästa deadline:            │   │
│  │ ███████░░░ 76%    │  │ "Beställ material" - 3 feb │   │
│  └───────────────────┘  └────────────────────────────┘   │
│                                                           │
│  ┌─ Senaste aktivitet ───────────────────────────────┐   │
│  │ • Kostnad tillagd: Konsulttimmar (15 000 kr)      │   │
│  │ • Dokument uppladdad: Offert.pdf                  │   │
│  │ • Checklistpunkt klar: "Granska ritningar"        │   │
│  └───────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────┘
```

---

### 3. Kompaktare header med Action Menu

**Vad ändras:**
Samla alla sekundära åtgärder (Export, Rapport, Beställningsutkast, Arkivera) i en dropdown-meny.

**Före:**
```text
[Redigera] [Beställningsutkast] [Exportera] [Rapport] [Arkivera]
```

**Efter:**
```text
[Redigera] [Åtgärder ▼]
              ├─ Beställningsutkast
              ├─ Exportera ZIP
              ├─ Generera rapport
              └─ Arkivera projekt
```

---

### 4. Förbättrad checklista

**Vad ändras:**
- Drag-and-drop för att ändra ordning
- Gruppering efter kategori (Planering, Genomförande, Avslut)
- Prioritetsnivåer (Hög, Normal, Låg)
- Inline-redigering av titel

**Ny layout:**
```text
┌─ Checklista ──────────────────────────────────────────────┐
│ Framsteg: ████████░░░░ 65% (8 av 12 klara)               │
├───────────────────────────────────────────────────────────┤
│ ▼ Planering (3 av 3 klara)                               │
│   ☑ Granska ritningar                                    │
│   ☑ Inhämta offerter                                     │
│   ☑ Godkänn budget                                       │
│                                                           │
│ ▼ Genomförande (4 av 7 klara)                            │
│   ☑ Beställ material                                     │
│   ☑ Starta byggnation                                    │
│   ☐ Mellanbesiktning          [!] 5 feb  @Erik          │
│   ☐ Slutbesiktning                   -   @Anna          │
│   ...                                                     │
│                                                           │
│ ▼ Avslut (1 av 2 klara)                                  │
│   ☐ Dokumentera                                          │
│   ☑ Fakturering                                          │
└───────────────────────────────────────────────────────────┘
```

---

### 5. Snabb-åtgärder från KPI-kort

**Vad ändras:**
Gör KPI-korten klickbara så att de leder direkt till relevant information.

**Interaktivitet:**
| Klick på | Åtgärd |
|----------|--------|
| Budget | Öppna Ekonomi-fliken |
| Prognos | Öppna Simulering |
| Utfall | Öppna Ekonomi-fliken med kostnader synliga |
| Avvikelse | Visa varning och förslag |

---

### 6. Mobilanpassning

**Vad ändras:**
- Tabs blir en swipebar horisontell lista
- KPI-kort staplas 2x2 istället för 4 i rad
- Action-knappen blir en floating button
- Checklistan får swipe-gester

**Mobil KPI-layout:**
```text
┌────────────┐ ┌────────────┐
│ Budget     │ │ Prognos    │
│ 500 000 kr │ │ 520 000 kr │
└────────────┘ └────────────┘
┌────────────┐ ┌────────────┐
│ Utfall     │ │ Avvikelse  │
│ 380 000 kr │ │ +4%        │
└────────────┘ └────────────┘

[+ Lägg till] (Floating action button)
```

---

### 7. Snabbstatus-ändring

**Vad ändras:**
Klick på status-badge öppnar en snabb dropdown för att byta status utan att gå via "Redigera".

**Interaktion:**
```text
[Pågående ▼]
 ├─ Planerat
 ├─ Inväntar offert
 ├─ Offert finns
 ├─ ● Pågående (nuvarande)
 ├─ Pausat
 └─ Avslutat
```

---

## Tekniska detaljer

### Filer som ändras

| Fil | Ändring |
|-----|---------|
| `src/pages/Projects.tsx` | Lägg till "Översikt"-flik med ProjectDashboard |
| `src/pages/ProjectDetail.tsx` | Ny startsida, kompakt header, klickbara KPI |
| `src/components/projects/ProjectOverview.tsx` | **NY FIL** - Kombinerad översiktsvy |
| `src/components/projects/ProjectQuickStatus.tsx` | **NY FIL** - Snabb statusändring |
| `src/components/projects/ProjectActionsMenu.tsx` | **NY FIL** - Dropdown för åtgärder |
| `src/components/projects/ProjectChecklistManagement.tsx` | Gruppering, prioritet, drag-and-drop |

### Nya komponenter

**ProjectOverview.tsx:**
```tsx
interface ProjectOverviewProps {
  project: Project;
  onNavigate: (tab: string) => void;
}

// Visar:
// - Ekonomi-sammanfattning med progress bar
// - Checklista-progress med nästa deadline
// - Senaste 3 aktiviteter
// - Klickbara kort som navigerar till rätt flik
```

**ProjectQuickStatus.tsx:**
```tsx
interface ProjectQuickStatusProps {
  projectId: string;
  currentStatus: ProjectStatus;
  onStatusChange: () => void;
}

// Dropdown-komponent för snabb statusändring
```

**ProjectActionsMenu.tsx:**
```tsx
interface ProjectActionsMenuProps {
  project: Project;
  onExport: () => void;
  onSendDraft: () => void;
  onArchive: () => void;
}

// DropdownMenu med alla sekundära åtgärder
```

### Checklista-förbättringar

```tsx
// Nya fält i project_checklist_items
interface ChecklistItem {
  // ... befintliga fält
  category: string | null;  // "planning" | "execution" | "closing"
  priority: string | null;  // "high" | "normal" | "low"
}

// Gruppering i UI:
const groupedItems = useMemo(() => {
  return {
    planning: items.filter(i => i.category === "planning"),
    execution: items.filter(i => i.category === "execution"),
    closing: items.filter(i => i.category === "closing"),
    uncategorized: items.filter(i => !i.category),
  };
}, [items]);
```

---

## Databasändringar

Lägg till nya kolumner för checklista-kategorier:

```sql
ALTER TABLE project_checklist_items 
ADD COLUMN category TEXT DEFAULT NULL,
ADD COLUMN priority TEXT DEFAULT 'normal';
```

---

## Prioritering

| Steg | Funktion | Komplexitet |
|------|----------|-------------|
| 1 | Aktivera Dashboard i projektlistan | Låg |
| 2 | Kompakt header med Action Menu | Låg |
| 3 | Snabb statusändring | Låg |
| 4 | Ny Projektöversikt-flik | Medel |
| 5 | Mobilanpassning | Medel |
| 6 | Klickbara KPI-kort | Låg |
| 7 | Förbättrad checklista med kategorier | Medel-Hög |

---

## Fördelar

- **Dashboard**: Direkt överblick utan att klicka på varje projekt
- **Ny översikt**: Viktigaste informationen synlig direkt
- **Kompakt header**: Renare gränssnitt, bättre på mobil
- **Snabb status**: Färre klick för vanliga åtgärder
- **Kategoriserad checklista**: Bättre struktur för större projekt
- **Mobilanpassning**: Fungerar lika bra på telefon som desktop

