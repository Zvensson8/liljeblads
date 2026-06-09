import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useRealtimeInvalidation } from '@/hooks/internal/useRealtimeInvalidation';
import { queryKeys } from '@/lib/queryKeys';
import { projectService } from '@/services/supabase';
import type {
  CreateProjectInput,
  ProjectListFilters,
  ProjectWithRelations,
  UpdateProjectInput,
} from '@/types/domain/project';

export type {
  CreateProjectInput,
  Project,
  ProjectListFilters,
  ProjectStatus,
  ProjectType,
  ProjectWithRelations,
  UpdateProjectInput,
} from '@/types/domain/project';

/**
 * Hook: fetch projects with optional filters. Subscribes to realtime
 * changes on the `projects` table.
 */
export function useProjects(filters: ProjectListFilters = {}) {
  const { session } = useAuth();

  useRealtimeInvalidation('projects', queryKeys.projects.all);

  return useQuery({
    queryKey: queryKeys.projects.list({ ...filters }),
    queryFn: () => projectService.list(filters),
    enabled: !!session,
    staleTime: 1000 * 60 * 2,
    gcTime: 1000 * 60 * 30,
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (input: CreateProjectInput) => projectService.create(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
      toast({ title: 'Projekt skapat' });
    },
    onError: (error: Error) => {
      toast({
        title: 'Kunde inte skapa projekt',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useUpdateProject() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateProjectInput }) =>
      projectService.update(id, patch),
    onMutate: async ({ id, patch }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.projects.all });
      const snapshots = queryClient.getQueriesData<ProjectWithRelations[]>({
        queryKey: queryKeys.projects.all,
      });
      snapshots.forEach(([key, list]) => {
        if (!list) return;
        queryClient.setQueryData<ProjectWithRelations[]>(
          key,
          list.map((p) =>
            p.id === id ? ({ ...p, ...patch } as ProjectWithRelations) : p,
          ),
        );
      });
      return { snapshots };
    },
    onError: (error: Error, _vars, ctx) => {
      ctx?.snapshots.forEach(([key, list]) => {
        queryClient.setQueryData(key, list);
      });
      toast({
        title: 'Kunde inte uppdatera projekt',
        description: error.message,
        variant: 'destructive',
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
    },
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (id: string) => projectService.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
      toast({ title: 'Projekt borttaget' });
    },
    onError: (error: Error) => {
      toast({
        title: 'Kunde inte ta bort projekt',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}
