import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { queryKeys } from '@/lib/queryKeys';
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

async function fetchProjects(
  filters: ProjectListFilters
): Promise<ProjectWithRelations[]> {
  let query = supabase
    .from('projects')
    .select(`
      *,
      properties (id, name)
    `)
    .order('created_at', { ascending: false });

  if (!filters.showArchived) query = query.eq('is_archived', false);
  if (filters.propertyId) query = query.eq('property_id', filters.propertyId);
  if (filters.status) query = query.eq('status', filters.status);
  if (filters.type) query = query.eq('type', filters.type);
  if (filters.year) query = query.eq('year', filters.year);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as ProjectWithRelations[];
}

/**
 * Hook: fetch projects with optional filters. Subscribes to realtime
 * changes on the `projects` table.
 */
export function useProjects(filters: ProjectListFilters = {}) {
  const queryClient = useQueryClient();
  const { session } = useAuth();

  const query = useQuery({
    queryKey: queryKeys.projects.list({ ...filters }),
    queryFn: () => fetchProjects(filters),
    enabled: !!session,
    staleTime: 1000 * 60 * 2,
    gcTime: 1000 * 60 * 30,
  });

  useEffect(() => {
    const channel = supabase
      .channel('projects-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'projects' },
        () => {
          queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return query;
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (input: CreateProjectInput) => {
      const { data, error } = await supabase
        .from('projects')
        .insert(input)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
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
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: UpdateProjectInput;
    }) => {
      const { data, error } = await supabase
        .from('projects')
        .update(patch)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
    },
    onError: (error: Error) => {
      toast({
        title: 'Kunde inte uppdatera projekt',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('projects').delete().eq('id', id);
      if (error) throw error;
    },
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
