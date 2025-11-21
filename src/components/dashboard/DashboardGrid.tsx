import { useMemo } from 'react';
import { Responsive, WidthProvider, Layout } from 'react-grid-layout';
import { useDashboardStore } from '@/store/dashboardStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Building2, Wrench, FolderKanban, CheckSquare, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

const ResponsiveGridLayout = WidthProvider(Responsive);

interface DashboardGridProps {
  kpiCards: Array<{
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
  const { layout, setLayout, isEditing } = useDashboardStore();

  const getTrendIcon = (current: number, previous: number | undefined) => {
    if (!previous || previous === 0) return null;
    const change = ((current - previous) / previous) * 100;
    if (Math.abs(change) < 1) return <Minus className="h-3 w-3 text-muted-foreground" />;
    if (change > 0) return <TrendingUp className="h-3 w-3 text-green-500" />;
    return <TrendingDown className="h-3 w-3 text-red-500" />;
  };

  const getTrendText = (current: number, previous: number | undefined) => {
    if (!previous || previous === 0) return null;
    const change = ((current - previous) / previous) * 100;
    if (Math.abs(change) < 1) return null;
    const sign = change > 0 ? "+" : "";
    return `${sign}${change.toFixed(0)}% från förra perioden`;
  };

  const handleLayoutChange = (newLayout: Layout[]) => {
    if (isEditing) {
      setLayout(newLayout);
    }
  };

  const layouts = useMemo(() => ({
    lg: layout,
    md: layout,
    sm: layout,
    xs: layout,
    xxs: layout,
  }), [layout]);

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
      {layout.map((item, index) => {
        const kpi = kpiCards[index];
        if (!kpi) return null;

        return (
          <div key={item.i}>
            <Card className={`h-full border-border/50 hover:shadow-[var(--shadow-elegant)] transition-all ${isEditing ? 'cursor-move' : ''}`}>
              <CardHeader className="pb-3 drag-handle">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`p-2 rounded-lg ${kpi.bgColor}`}>
                      <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
                    </div>
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      {kpi.title}
                    </CardTitle>
                  </div>
                  {getTrendIcon(kpi.value, kpi.prev)}
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold mb-2">{kpi.value}</div>
                {getTrendText(kpi.value, kpi.prev) && (
                  <p className="text-xs text-muted-foreground mb-1">
                    {getTrendText(kpi.value, kpi.prev)}
                  </p>
                )}
                {kpi.subtitle && (
                  <p className="text-sm text-muted-foreground mb-1">{kpi.subtitle}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  {kpi.description}
                </p>
              </CardContent>
            </Card>
          </div>
        );
      })}
    </ResponsiveGridLayout>
  );
};