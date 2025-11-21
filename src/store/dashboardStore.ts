import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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
  config: Record<string, any>;
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
  { i: 'kpi-properties', x: 0, y: 0, w: 3, h: 2 },
  { i: 'kpi-workorders', x: 3, y: 0, w: 3, h: 2 },
  { i: 'kpi-projects', x: 6, y: 0, w: 3, h: 2 },
  { i: 'kpi-todos', x: 9, y: 0, w: 3, h: 2 },
];

const defaultWidgets: DashboardWidget[] = [
  { id: 'kpi-properties', type: 'kpi-card', config: { metric: 'properties' } },
  { id: 'kpi-workorders', type: 'kpi-card', config: { metric: 'workorders' } },
  { id: 'kpi-projects', type: 'kpi-card', config: { metric: 'projects' } },
  { id: 'kpi-todos', type: 'kpi-card', config: { metric: 'todos' } },
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
      name: 'dashboard-storage',
    }
  )
);
