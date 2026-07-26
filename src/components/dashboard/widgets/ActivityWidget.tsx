import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Activity, Calendar } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { useAuth } from '@/hooks/useAuth';

interface ActivityItem {
  id: string;
  activity_type: string;
  description: string;
  created_at: string;
  created_by: string | null;
}

// Note: `project_activity_log` has no dedicated hook yet — using TanStack Query
// directly keeps the same caching/realtime story until a hook lands.
export const ActivityWidget = () => {
  const { session } = useAuth();
  const { data: activities = [], isLoading } = useQuery<ActivityItem[]>({
    queryKey: ['project-activity-log', 'recent'],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_activity_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);
      if (error) throw error;
      return (data ?? []) as ActivityItem[];
    },
    staleTime: 1000 * 60,
  });

  return (
    <Card className="h-full border-border/50">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" />
          <CardTitle>Senaste aktiviteter</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Laddar...</p>
        ) : activities.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Ingen aktivitet ännu
          </p>
        ) : (
          <div className="space-y-3">
            {activities.map((activity) => (
              <div
                key={activity.id}
                className="flex gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{activity.description}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Calendar className="h-3 w-3 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(activity.created_at), 'PPp', { locale: sv })}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
