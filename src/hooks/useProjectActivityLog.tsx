import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { queryKeys } from '@/lib/queryKeys';

export interface LogProjectActivityInput {
  project_id: string;
  activity_type: string;
  description: string;
  metadata?: Record<string, unknown> | null;
}

/**
 * Mutation hook: append an entry to `project_activity_log` and invalidate
 * any project activity queries so timelines stay in sync.
 */
export function useLogProjectActivity() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: LogProjectActivityInput) => {
      const { error } = await supabase
        .from('project_activity_log')
        .insert(input as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
    },
  });
}
