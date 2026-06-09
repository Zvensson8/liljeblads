import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { queryKeys } from "@/lib/queryKeys";

export interface DriftTaskComponentLink {
  id: string;
  task_id: string;
  component_id: string | null;
  object_name: string | null;
  is_reported: boolean;
  series_id: string | null;
  registration_number: string | null;
  auto_detected_from?: string | null;
  manually_edited?: boolean;
}

export type CreateDriftTaskComponentInput = Omit<
  DriftTaskComponentLink,
  "id" | "auto_detected_from"
> & { auto_detected_from?: string | null };

/** Fetch links for a list of task ids (used when overlaying per-property). */
export function useDriftTaskComponentsByTasks(taskIds: string[]) {
  const { session } = useAuth();
  return useQuery({
    queryKey: queryKeys.driftTaskComponents.byTasks(taskIds),
    queryFn: async (): Promise<
      Pick<DriftTaskComponentLink, "task_id" | "component_id" | "id">[]
    > => {
      if (taskIds.length === 0) return [];
      const { data, error } = await supabase
        .from("drift_task_components")
        .select("id, task_id, component_id")
        .in("task_id", taskIds);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!session && taskIds.length > 0,
    staleTime: 1000 * 60,
  });
}

export function useCreateDriftTaskComponent() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (input: CreateDriftTaskComponentInput) => {
      const { data, error } = await supabase
        .from("drift_task_components")
        .insert(input)
        .select()
        .single();
      if (error) throw error;
      return data as DriftTaskComponentLink;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.driftTaskComponents.all });
    },
    onError: (e: Error) =>
      toast({
        title: "Kunde inte lägga till komponent",
        description: e.message,
        variant: "destructive",
      }),
  });
}

export function useDeleteDriftTaskComponentByTaskAndComponent() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({
      taskId,
      componentId,
    }: {
      taskId: string;
      componentId: string;
    }) => {
      const { error } = await supabase
        .from("drift_task_components")
        .delete()
        .eq("task_id", taskId)
        .eq("component_id", componentId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.driftTaskComponents.all });
    },
    onError: (e: Error) =>
      toast({
        title: "Kunde inte ta bort komponent",
        description: e.message,
        variant: "destructive",
      }),
  });
}
