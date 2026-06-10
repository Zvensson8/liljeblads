import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { queryKeys } from '@/lib/queryKeys';

export interface ProjectActivityLogEntry {
  id: string;
  project_id: string;
  activity_type: string;
  description: string;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

export interface LogProjectActivityInput {
  project_id: string;
  activity_type: string;
  description: string;
  metadata?: Record<string, unknown> | null;
}

const activityKey = (projectId: string) => [...queryKeys.projects.all, 'activity', projectId] as const;

export function useProjectActivityLog(projectId: string | undefined, limit = 50) {
  return useQuery({
    queryKey: activityKey(projectId ?? ''),
    enabled: !!projectId,
    queryFn: async (): Promise<ProjectActivityLogEntry[]> => {
      const { data, error } = await supabase
        .from('project_activity_log')
        .select('*')
        .eq('project_id', projectId!)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as ProjectActivityLogEntry[];
    },
  });
}

export function useLogProjectActivity() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: LogProjectActivityInput) => {
      const { error } = await supabase
        .from('project_activity_log')
        .insert(input);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
      queryClient.invalidateQueries({ queryKey: activityKey(vars.project_id) });
    },
  });
}

export function useUpdateProjectActivity() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { id: string; activity_type: string; description: string }) => {
      const { error } = await supabase
        .from('project_activity_log')
        .update({ activity_type: input.activity_type, description: input.description })
        .eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
    },
  });
}

export function useDeleteProjectActivity() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('project_activity_log')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
    },
  });
}
