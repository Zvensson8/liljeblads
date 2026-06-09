import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { queryKeys } from "@/lib/queryKeys";

export interface ProjectCostItem {
  id: string;
  project_id: string;
  description: string;
  amount: number;
  cost_date: string;
  actor: string | null;
  category: string | null;
  created_at: string;
}

export type CreateProjectCostItemInput = Omit<
  ProjectCostItem,
  "id" | "created_at"
>;
export type UpdateProjectCostItemInput = Partial<
  Omit<ProjectCostItem, "id" | "project_id" | "created_at">
>;

export function useProjectCostItems(projectId: string | undefined) {
  const { session } = useAuth();
  return useQuery({
    queryKey: projectId
      ? queryKeys.projectCostItems.byProject(projectId)
      : queryKeys.projectCostItems.all,
    queryFn: async (): Promise<ProjectCostItem[]> => {
      if (!projectId) return [];
      const { data, error } = await supabase
        .from("project_cost_items")
        .select("*")
        .eq("project_id", projectId)
        .order("cost_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ProjectCostItem[];
    },
    enabled: !!session && !!projectId,
    staleTime: 1000 * 60 * 2,
  });
}

export function useCreateProjectCostItem() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (input: CreateProjectCostItemInput) => {
      const { data, error } = await supabase
        .from("project_cost_items")
        .insert(input)
        .select()
        .single();
      if (error) throw error;
      return data as ProjectCostItem;
    },
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: queryKeys.projectCostItems.all });
      qc.invalidateQueries({
        queryKey: queryKeys.projectCostItems.byProject(row.project_id),
      });
    },
    onError: (e: Error) =>
      toast({
        title: "Kunde inte spara kostnad",
        description: e.message,
        variant: "destructive",
      }),
  });
}

export function useUpdateProjectCostItem() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: UpdateProjectCostItemInput;
    }) => {
      const { data, error } = await supabase
        .from("project_cost_items")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as ProjectCostItem;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.projectCostItems.all });
    },
    onError: (e: Error) =>
      toast({
        title: "Kunde inte uppdatera kostnad",
        description: e.message,
        variant: "destructive",
      }),
  });
}

export function useDeleteProjectCostItem() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("project_cost_items")
        .delete()
        .eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.projectCostItems.all });
    },
    onError: (e: Error) =>
      toast({
        title: "Kunde inte ta bort kostnad",
        description: e.message,
        variant: "destructive",
      }),
  });
}
