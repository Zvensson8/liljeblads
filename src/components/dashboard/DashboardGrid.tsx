import { useMemo } from 'react';
import { Responsive, WidthProvider, Layout } from 'react-grid-layout';
import { useDashboardStore } from '@/store/dashboardStore';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { KPIWidget } from './widgets/KPIWidget';
import { ActivityWidget } from './widgets/ActivityWidget';
import { QuickStatsWidget } from './widgets/QuickStatsWidget';
import { RecentProjectsWidget } from './widgets/RecentProjectsWidget';
import { UpcomingTasksWidget } from './widgets/UpcomingTasksWidget';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

const ResponsiveGridLayout = WidthProvider(Responsive);

interface DashboardGridProps {
  kpiCards: Array<{
    id: string;
    title: string;
    value: number;
    prev?: number;
    subtitle?: string;
    icon: any;
    description: string;
    color: string;
    bgColor: string;
  }>;
}

export const DashboardGrid = ({ kpiCards }: DashboardGridProps) => {
  const { layout, setLayout, isEditing, removeWidget, widgets } = useDashboardStore();

  const handleLayoutChange = (newLayout: Layout[]) => {
    if (isEditing) {
      setLayout(newLayout);
    }
  };

  const handleRemove = (id: string) => {
    removeWidget(id);
    toast.success('Widget borttagen');
  };

  // Create responsive layouts - on mobile, stack widgets vertically full width
  const layouts = useMemo(() => {
    const mobileLayout = layout.map((item, index) => ({
      ...item,
      x: 0,
      y: index * 2,
      w: 2, // Full width on xxs (2 cols)
      h: 2,
    }));
    
    const smallLayout = layout.map((item, index) => ({
      ...item,
      x: (index % 2) * 2,
      y: Math.floor(index / 2) * 2,
      w: 2, // Half width on xs (4 cols)
      h: 2,
    }));
    
    const mediumLayout = layout.map((item, index) => ({
      ...item,
      x: (index % 3) * 2,
      y: Math.floor(index / 3) * 2,
      w: 2,
      h: 2,
    }));

    return {
      lg: layout,
      md: layout,
      sm: mediumLayout,
      xs: smallLayout,
      xxs: mobileLayout,
    };
  }, [layout]);

  const renderWidget = (widgetId: string) => {
    const widget = widgets.find(w => w.id === widgetId);
    if (!widget) return null;

    // KPI cards
    const kpiCard = kpiCards.find(k => k.id === widgetId);
    if (kpiCard) {
      return <KPIWidget {...kpiCard} />;
    }

    // Other widget types
    switch (widget.type) {
      case 'activity':
        return <ActivityWidget />;
      case 'quick-stats':
        return <QuickStatsWidget />;
      case 'recent-projects':
        return <RecentProjectsWidget />;
      case 'upcoming-tasks':
        return <UpcomingTasksWidget />;
      default:
        return null;
    }
  };

  return (
    <ResponsiveGridLayout
      className="layout"
      layouts={layouts}
      breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
      cols={{ lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }}
      rowHeight={80}
      onLayoutChange={handleLayoutChange}
      isDraggable={isEditing}
      isResizable={isEditing}
      draggableHandle=".drag-handle"
    >
      {layout.map((item) => (
        <div key={item.i} className="relative">
          {isEditing && (
            <div className="absolute top-2 right-2 z-10 flex gap-1">
              <div className="flex gap-1 text-[10px] bg-background/95 rounded border p-1">
                <button
                  type="button"
                  className="px-1 py-0.5 rounded border border-border/50 hover:bg-muted/60"
                  onClick={() => setLayout(layout.map(l => l.i === item.i ? { ...l, w: 3, h: 2 } : l))}
                >
                  S
                </button>
                <button
                  type="button"
                  className="px-1 py-0.5 rounded border border-border/50 hover:bg-muted/60"
                  onClick={() => setLayout(layout.map(l => l.i === item.i ? { ...l, w: 6, h: 3 } : l))}
                >
                  M
                </button>
                <button
                  type="button"
                  className="px-1 py-0.5 rounded border border-border/50 hover:bg-muted/60"
                  onClick={() => setLayout(layout.map(l => l.i === item.i ? { ...l, w: 12, h: 4 } : l))}
                >
                  L
                </button>
              </div>
              <Button
                variant="destructive"
                size="icon"
                className="h-6 w-6"
                onClick={() => handleRemove(item.i)}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          )}
          <div className={isEditing ? 'drag-handle cursor-move' : ''}>
            {renderWidget(item.i)}
          </div>
        </div>
      ))}
    </ResponsiveGridLayout>
  );
};
