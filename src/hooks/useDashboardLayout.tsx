import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useDashboardStore } from '@/store/dashboardStore';
import { useEffect } from 'react';
import type { Json } from '@/integrations/supabase/types';

interface DashboardLayoutItem {
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

interface DashboardLayoutRow {
  id: string;
  user_id: string;
  layout: DashboardLayoutItem[];
  widgets: DashboardWidget[];
  is_default: boolean;
}

export const useDashboardLayout = () => {
  const queryClient = useQueryClient();
  const { layout, widgets, setLayout, setWidgets } = useDashboardStore();

  const { data: savedLayout, isLoading } = useQuery({
    queryKey: ['dashboard-layout'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('dashboard_layouts')
        .select('*')
        .eq('is_default', true)
        .maybeSingle();

      if (error) throw error;
      return (data as unknown as DashboardLayoutRow | null) ?? null;
    },
  });

  useEffect(() => {
    if (savedLayout) {
      setLayout(savedLayout.layout);
      setWidgets(savedLayout.widgets);
    }
  }, [savedLayout, setLayout, setWidgets]);

  const saveLayoutMutation = useMutation({
    mutationFn: async () => {
      const { data: existing } = await supabase
        .from('dashboard_layouts')
        .select('id')
        .eq('is_default', true)
        .maybeSingle();

      const layoutJson = layout as unknown as Json;
      const widgetsJson = widgets as unknown as Json;

      if (existing) {
        const { error } = await supabase
          .from('dashboard_layouts')
          .update({ layout: layoutJson, widgets: widgetsJson })
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('User not authenticated');

        const { error } = await supabase.from('dashboard_layouts').insert({
          layout: layoutJson,
          widgets: widgetsJson,
          is_default: true,
          user_id: user.id,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard-layout'] });
    },
  });

  return {
    layout,
    widgets,
    isLoading,
    saveLayout: saveLayoutMutation.mutate,
    isSaving: saveLayoutMutation.isPending,
  };
};
