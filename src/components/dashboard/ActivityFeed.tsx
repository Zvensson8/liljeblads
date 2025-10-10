import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { Activity, Package, AlertTriangle, CheckCircle } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

interface ActivityItem {
  id: string;
  type: 'component' | 'maintenance' | 'task';
  title: string;
  description: string;
  timestamp: string;
  status?: 'success' | 'warning' | 'info';
}

export function ActivityFeed() {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchActivities();
  }, []);

  const fetchActivities = async () => {
    try {
      // Fetch recent components
      const { data: components } = await supabase
        .from('components')
        .select('id, name, created_at, status')
        .order('created_at', { ascending: false })
        .limit(3);

      // Fetch recent maintenance
      const { data: maintenance } = await supabase
        .from('maintenance_history')
        .select('id, action_type, performed_date, component_id, components(name)')
        .order('performed_date', { ascending: false })
        .limit(3);

      // Fetch recent drift tasks
      const { data: tasks } = await supabase
        .from('drift_tasks')
        .select('id, name, created_at, reported_count, planned_count')
        .order('created_at', { ascending: false })
        .limit(3);

      const activityList: ActivityItem[] = [];

      // Add components
      components?.forEach(comp => {
        activityList.push({
          id: comp.id,
          type: 'component',
          title: 'Ny komponent tillagd',
          description: comp.name,
          timestamp: comp.created_at,
          status: comp.status === 'active' ? 'success' : comp.status === 'maintenance' ? 'warning' : 'info'
        });
      });

      // Add maintenance
      maintenance?.forEach(maint => {
        activityList.push({
          id: maint.id,
          type: 'maintenance',
          title: `Underhåll: ${maint.action_type}`,
          description: (maint.components as any)?.name || 'Komponent',
          timestamp: maint.performed_date,
          status: 'success'
        });
      });

      // Add tasks
      tasks?.forEach(task => {
        const completion = task.planned_count > 0 
          ? (task.reported_count / task.planned_count) * 100 
          : 0;
        activityList.push({
          id: task.id,
          type: 'task',
          title: task.name,
          description: `${task.reported_count}/${task.planned_count} objekt rapporterade`,
          timestamp: task.created_at,
          status: completion >= 100 ? 'success' : completion > 0 ? 'warning' : 'info'
        });
      });

      // Sort by timestamp
      activityList.sort((a, b) => 
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

      setActivities(activityList.slice(0, 8));
    } catch (error) {
      console.error('Error fetching activities:', error);
    } finally {
      setLoading(false);
    }
  };

  const getIcon = (type: string, status?: string) => {
    if (type === 'component') return Package;
    if (type === 'maintenance') return CheckCircle;
    if (type === 'task') {
      if (status === 'success') return CheckCircle;
      if (status === 'warning') return AlertTriangle;
    }
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
        <ScrollArea className="h-[400px] pr-4">
          <div className="space-y-4">
            {activities.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                Ingen aktivitet än
              </p>
            ) : (
              activities.map((activity) => {
                const Icon = getIcon(activity.type, activity.status);
                return (
                  <div
                    key={activity.id}
                    className="flex gap-4 p-3 rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className={`p-2 rounded-lg bg-muted ${getIconColor(activity.status)}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{activity.title}</p>
                      <p className="text-sm text-muted-foreground truncate">
                        {activity.description}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {format(new Date(activity.timestamp), 'PPp', { locale: sv })}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
