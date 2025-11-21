import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useDashboardStore } from '@/store/dashboardStore';
import { useEffect } from 'react';

interface DashboardLayout {
  id: string;
  user_id: string;
  layout: any[];
  widgets: any[];
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
      return data as DashboardLayout | null;
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

      if (existing) {
        const { error } = await supabase
          .from('dashboard_layouts')
          .update({
            layout: layout as any,
            widgets: widgets as any,
          })
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('User not authenticated');
        
        const { error } = await supabase.from('dashboard_layouts').insert({
          layout: layout as any,
          widgets: widgets as any,
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
