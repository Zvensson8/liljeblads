import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart3 } from 'lucide-react';
import { useProperties } from '@/hooks/useProperties';
import { useWorkOrders } from '@/hooks/useWorkOrders';
import { useProjects } from '@/hooks/useProjects';
import { useComponents } from '@/hooks/useComponents';

export const QuickStatsWidget = () => {
  const properties = useProperties();
  const workOrders = useWorkOrders();
  const projects = useProjects();
  const components = useComponents();

  const loading =
    properties.isLoading ||
    workOrders.isLoading ||
    projects.isLoading ||
    components.isLoading;

  const statItems = [
    { label: 'Fastigheter', value: properties.data?.length ?? 0, color: 'text-blue-500' },
    { label: 'Arbetsordrar', value: workOrders.data?.length ?? 0, color: 'text-orange-500' },
    { label: 'Projekt', value: projects.data?.length ?? 0, color: 'text-purple-500' },
    { label: 'Komponenter', value: components.data?.length ?? 0, color: 'text-green-500' },
  ];

  return (
    <Card className="h-full border-border/50">
      <CardHeader>
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary" />
          <CardTitle>Snabbstatistik</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Laddar...</p>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {statItems.map((item) => (
              <div key={item.label} className="flex flex-col items-center p-3 rounded-lg bg-muted/50">
                <span className={`text-2xl font-bold ${item.color}`}>{item.value}</span>
                <span className="text-xs text-muted-foreground mt-1">{item.label}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
