import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { queryKeys } from '@/lib/queryKeys';

export interface UnitPrice {
  id: string;
  organization_id: string;
  component_type: string;
  label: string;
  replacement_cost: number;
  service_cost: number | null;
  currency: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface UnitPriceInput {
  component_type: string;
  label: string;
  replacement_cost: number;
  service_cost?: number | null;
  is_active?: boolean;
  currency?: string;
}

/** Common types/labels for suggestions when adding prices */
export const UNIT_PRICE_TYPE_SUGGESTIONS: { type: string; label: string }[] = [
  { type: 'entréparti', label: 'Entréparti' },
  { type: 'fönster', label: 'Fönster' },
  { type: 'tak', label: 'Tak' },
  { type: 'fasad', label: 'Fasad' },
  { type: 'hiss', label: 'Hiss' },
  { type: 'SC1', label: 'SC1 Styr' },
  { type: 'SC4.5.1', label: 'SC4.5.1 Kyla' },
  { type: 'SC4.6.2.6', label: 'SC4.6.2.6 Värmepump' },
  { type: 'SC4.7', label: 'SC4.7 Ventilation' },
  { type: 'SC4.1.6.9', label: 'SC4.1.6.9 Fjärrvärme' },
  { type: 'SC7.1', label: 'SC7.1 Hiss' },
  { type: 'SC7.2', label: 'SC7.2 Rulltrappa' },
  { type: 'SC2.3.4', label: 'SC2.3.4 Maskinport' },
  { type: 'SC5.5', label: 'SC5.5 Nödkraft' },
];

export function useUnitPrices(organizationId: string | undefined) {
  const { session } = useAuth();

  return useQuery({
    queryKey: queryKeys.unitPrices.byOrg(organizationId ?? 'none'),
    queryFn: async (): Promise<UnitPrice[]> => {
      const { data, error } = await supabase
        .from('component_unit_prices')
        .select('*')
        .eq('organization_id', organizationId!)
        .order('label', { ascending: true });
      if (error) throw error;
      return (data ?? []) as UnitPrice[];
    },
    enabled: !!session && !!organizationId,
    staleTime: 1000 * 60 * 2,
  });
}

export function useCreateUnitPrice(organizationId: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: UnitPriceInput): Promise<UnitPrice> => {
      const type = input.component_type.trim();
      const label = input.label.trim();
      if (!type) throw new Error('Komponenttyp krävs');
      if (!label) throw new Error('Namn/etikett krävs');
      if (!Number.isFinite(input.replacement_cost) || input.replacement_cost < 0) {
        throw new Error('Byteskostnad måste vara ≥ 0');
      }

      const { data, error } = await supabase
        .from('component_unit_prices')
        .insert({
          organization_id: organizationId,
          component_type: type,
          label,
          replacement_cost: input.replacement_cost,
          service_cost:
            input.service_cost != null && Number.isFinite(input.service_cost)
              ? input.service_cost
              : null,
          currency: input.currency ?? 'SEK',
          is_active: input.is_active ?? true,
        })
        .select('*')
        .single();

      if (error) {
        if (error.code === '23505') {
          throw new Error(
            `Pris för typen "${type}" finns redan. Redigera den befintliga raden istället.`,
          );
        }
        throw error;
      }
      return data as UnitPrice;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.unitPrices.byOrg(organizationId) });
    },
  });
}

export function useUpdateUnitPrice(organizationId: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (args: {
      id: string;
      patch: Partial<UnitPriceInput>;
    }): Promise<UnitPrice> => {
      const patch: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      if (args.patch.component_type != null) {
        patch.component_type = args.patch.component_type.trim();
      }
      if (args.patch.label != null) {
        patch.label = args.patch.label.trim();
      }
      if (args.patch.replacement_cost != null) {
        if (
          !Number.isFinite(args.patch.replacement_cost) ||
          args.patch.replacement_cost < 0
        ) {
          throw new Error('Byteskostnad måste vara ≥ 0');
        }
        patch.replacement_cost = args.patch.replacement_cost;
      }
      if (args.patch.service_cost !== undefined) {
        patch.service_cost =
          args.patch.service_cost != null && Number.isFinite(args.patch.service_cost)
            ? args.patch.service_cost
            : null;
      }
      if (args.patch.is_active != null) {
        patch.is_active = args.patch.is_active;
      }
      if (args.patch.currency != null) {
        patch.currency = args.patch.currency;
      }

      const { data, error } = await supabase
        .from('component_unit_prices')
        .update(patch)
        .eq('id', args.id)
        .eq('organization_id', organizationId)
        .select('*')
        .single();

      if (error) {
        if (error.code === '23505') {
          throw new Error('En annan rad har redan samma komponenttyp.');
        }
        throw error;
      }
      return data as UnitPrice;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.unitPrices.byOrg(organizationId) });
    },
  });
}

export function useDeleteUnitPrice(organizationId: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase
        .from('component_unit_prices')
        .delete()
        .eq('id', id)
        .eq('organization_id', organizationId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.unitPrices.byOrg(organizationId) });
    },
  });
}
