/**
 * Hooks for `property_recurring_costs` (+ history sub-resource).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { createEntityHooks } from '@/hooks/internal/createEntityHooks';
import { queryKeys } from '@/lib/queryKeys';
import {
  recurringCostService,
  recurringCostHistoryService,
} from '@/services/supabase';
import type {
  RecurringCost,
  RecurringCostInsert,
  RecurringCostUpdate,
  RecurringCostFilters,
  RecurringCostHistory,
  RecurringCostHistoryInsert,
} from '@/services/supabase';

export type {
  RecurringCost,
  RecurringCostInsert,
  RecurringCostUpdate,
  RecurringCostFilters,
  RecurringCostHistory,
  RecurringCostHistoryInsert,
};

const hooks = createEntityHooks<
  RecurringCost,
  RecurringCostInsert,
  RecurringCostUpdate,
  RecurringCostFilters
>({
  service: recurringCostService,
  keys: queryKeys.recurringCosts,
  realtimeTable: 'property_recurring_costs',
  labels: {
    createdToast: 'Återkommande kostnad sparad',
    deletedToast: 'Återkommande kostnad borttagen',
    createErrorTitle: 'Kunde inte spara kostnad',
    updateErrorTitle: 'Kunde inte uppdatera kostnad',
    deleteErrorTitle: 'Kunde inte ta bort kostnad',
  },
});

export const useRecurringCosts = hooks.useList;
export const useRecurringCost = hooks.useGetById;
export const useCreateRecurringCost = hooks.useCreate;
export const useUpdateRecurringCost = hooks.useUpdate;
export const useDeleteRecurringCost = hooks.useRemove;

export function useRecurringCostHistory(recurringCostId: string | undefined) {
  const { session } = useAuth();
  return useQuery<RecurringCostHistory[]>({
    queryKey: queryKeys.recurringCostHistory.list({ recurringCostId }),
    queryFn: () =>
      recurringCostId
        ? recurringCostHistoryService.listForCost(recurringCostId)
        : Promise.resolve([]),
    enabled: !!session && !!recurringCostId,
    staleTime: 1000 * 60 * 2,
  });
}

export function useCreateRecurringCostHistory() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (input: RecurringCostHistoryInsert) =>
      recurringCostHistoryService.create(input),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.recurringCostHistory.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.recurringCosts.all });
      if (vars.recurring_cost_id) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.recurringCostHistory.list({
            recurringCostId: vars.recurring_cost_id,
          }),
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: 'Kunde inte registrera betalning',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useDeleteRecurringCostHistory() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (id: string) => recurringCostHistoryService.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.recurringCostHistory.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.recurringCosts.all });
    },
    onError: (error: Error) => {
      toast({
        title: 'Kunde inte ta bort betalning',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}
