import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { Activity, Package, CheckCircle } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { queryKeys } from '@/lib/queryKeys';

interface ActivityItem {
  id: string;
  type: 'component' | 'maintenance';
  title: string;
  description: string;
  timestamp: string;
  status?: 'success' | 'warning' | 'info';
}

/**
 * Dashboard "Senaste aktiviteter" feed (components + servicehistorik).
 */
export function ActivityFeed() {
  const { data: components = [], isLoading: componentsLoading } = useQuery({
    queryKey: [...queryKeys.components.all, 'activity-feed'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('components')
        .select('id, name, created_at, status')
        .order('created_at', { ascending: false })
        .limit(5);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 1000 * 60 * 2,
  });

  const { data: maintenance = [], isLoading: maintenanceLoading } = useQuery({
    queryKey: [...queryKeys.maintenanceHistory.all, 'activity-feed'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('maintenance_history')
        .select('id, action_type, performed_date, component_id, components(name)')
        .order('performed_date', { ascending: false })
        .limit(5);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 1000 * 60 * 2,
  });

  const loading = componentsLoading || maintenanceLoading;

  const activities = useMemo<ActivityItem[]>(() => {
    const list: ActivityItem[] = [];

    components.forEach((comp) => {
      list.push({
        id: comp.id,
        type: 'component',
        title: 'Ny komponent tillagd',
        description: comp.name,
        timestamp: comp.created_at,
        status:
          comp.status === 'active'
            ? 'success'
            : comp.status === 'maintenance'
              ? 'warning'
              : 'info',
      });
    });

    maintenance.forEach((maint) => {
      list.push({
        id: maint.id,
        type: 'maintenance',
        title: `Underhåll: ${maint.action_type}`,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        description: (maint.components as { name?: string } | null)?.name || 'Komponent',
        timestamp: maint.performed_date,
        status: 'success',
      });
    });

    return list
      .sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      )
      .slice(0, 8);
  }, [components, maintenance]);

  const getIcon = (type: string) => {
    if (type === 'component') return Package;
    if (type === 'maintenance') return CheckCircle;
    return Activity;
  };

  const getIconColor = (status?: string) => {
    if (status === 'success') return 'text-green-500';
    if (status === 'warning') return 'text-yellow-500';
    return 'text-blue-500';
  };

  if (loading) {
    return (
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Senaste aktiviteter
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5" />
          Senaste aktiviteter
        </CardTitle>
      </CardHeader>
      <CardContent>
        {activities.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            Inga aktiviteter ännu
          </p>
        ) : (
          <ScrollArea className="h-[280px] pr-3">
            <ul className="space-y-3">
              {activities.map((item) => {
                const Icon = getIcon(item.type);
                return (
                  <li key={`${item.type}-${item.id}`} className="flex gap-3">
                    <div
                      className={`mt-0.5 rounded-full bg-muted p-1.5 ${getIconColor(item.status)}`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium leading-tight">{item.title}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {item.description}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {format(new Date(item.timestamp), 'PPp', { locale: sv })}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
