import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Slim dashboard: only three KPIs are product-facing.
 * Store kept for any residual layout prefs; customizer is retired.
 */
interface DashboardLayout {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface DashboardWidget {
  id: string;
  type: string;
  config: Record<string, unknown>;
}

interface DashboardState {
  layout: DashboardLayout[];
  widgets: DashboardWidget[];
  isEditing: boolean;
  setLayout: (layout: DashboardLayout[]) => void;
  setWidgets: (widgets: DashboardWidget[]) => void;
  addWidget: (widget: DashboardWidget) => void;
  removeWidget: (id: string) => void;
  setEditing: (editing: boolean) => void;
  resetToDefault: () => void;
}

const defaultLayout: DashboardLayout[] = [
  { i: 'kpi-properties', x: 0, y: 0, w: 4, h: 2 },
  { i: 'kpi-workorders', x: 4, y: 0, w: 4, h: 2 },
  { i: 'kpi-projects', x: 8, y: 0, w: 4, h: 2 },
];

const defaultWidgets: DashboardWidget[] = [
  { id: 'kpi-properties', type: 'kpi-card', config: { metric: 'properties' } },
  { id: 'kpi-workorders', type: 'kpi-card', config: { metric: 'workorders' } },
  { id: 'kpi-projects', type: 'kpi-card', config: { metric: 'projects' } },
];

export const useDashboardStore = create<DashboardState>()(
  persist(
    (set) => ({
      layout: defaultLayout,
      widgets: defaultWidgets,
      isEditing: false,
      setLayout: (layout) => set({ layout }),
      setWidgets: (widgets) => set({ widgets }),
      addWidget: (widget) =>
        set((state) => ({
          widgets: [...state.widgets, widget],
          layout: [
            ...state.layout,
            { i: widget.id, x: 0, y: Infinity, w: 6, h: 4 },
          ],
        })),
      removeWidget: (id) =>
        set((state) => ({
          widgets: state.widgets.filter((w) => w.id !== id),
          layout: state.layout.filter((l) => l.i !== id),
        })),
      setEditing: (editing) => set({ isEditing: editing }),
      resetToDefault: () =>
        set({ layout: defaultLayout, widgets: defaultWidgets }),
    }),
    {
      name: 'dashboard-storage-v2',
    }
  )
);
