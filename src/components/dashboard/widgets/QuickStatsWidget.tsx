import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart3, TrendingUp } from 'lucide-react';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface QuickStats {
  properties: number;
  workOrders: number;
  projects: number;
  components: number;
}

export const QuickStatsWidget = () => {
  const [stats, setStats] = useState<QuickStats>({
    properties: 0,
    workOrders: 0,
    projects: 0,
    components: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const [properties, workOrders, projects, components] = await Promise.all([
        supabase.from('properties').select('id', { count: 'exact', head: true }),
        supabase.from('work_orders').select('id', { count: 'exact', head: true }),
        supabase.from('projects').select('id', { count: 'exact', head: true }),
        supabase.from('components').select('id', { count: 'exact', head: true }),
      ]);

      setStats({
        properties: properties.count || 0,
        workOrders: workOrders.count || 0,
        projects: projects.count || 0,
        components: components.count || 0,
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const statItems = [
    { label: 'Fastigheter', value: stats.properties, color: 'text-blue-500' },
    { label: 'Arbetsordrar', value: stats.workOrders, color: 'text-orange-500' },
    { label: 'Projekt', value: stats.projects, color: 'text-purple-500' },
    { label: 'Komponenter', value: stats.components, color: 'text-green-500' },
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
