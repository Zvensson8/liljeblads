import { supabase } from '@/integrations/supabase/client';
import { createCrudService } from './createCrudService';
import type {
  Tables,
  TablesInsert,
  TablesUpdate,
} from '@/integrations/supabase/types';

export type RecurringCost = Tables<'property_recurring_costs'>;
export type RecurringCostInsert = TablesInsert<'property_recurring_costs'>;
export type RecurringCostUpdate = TablesUpdate<'property_recurring_costs'>;
export type RecurringCostHistory = Tables<'recurring_cost_history'>;
export type RecurringCostHistoryInsert = TablesInsert<'recurring_cost_history'>;

export interface RecurringCostFilters {
  propertyId?: string;
  accountCodeId?: string;
}

export const recurringCostService = createCrudService<
  RecurringCost,
  RecurringCostInsert,
  RecurringCostUpdate,
  RecurringCostFilters
>({
  table: 'property_recurring_costs',
  defaultOrder: { column: 'next_due_date', ascending: true, nullsFirst: false },
  applyFilters: (q, f) => {
    let r = q;
    if (f.propertyId) r = r.eq('property_id', f.propertyId);
    if (f.accountCodeId) r = r.eq('account_code_id', f.accountCodeId);
    return r;
  },
});

export const recurringCostHistoryService = {
  async listForCost(recurringCostId: string): Promise<RecurringCostHistory[]> {
    const { data, error } = await supabase
      .from('recurring_cost_history')
      .select('*')
      .eq('recurring_cost_id', recurringCostId)
      .order('payment_date', { ascending: false });
    if (error) throw error;
    return (data ?? []) as RecurringCostHistory[];
  },
  async create(input: RecurringCostHistoryInsert): Promise<RecurringCostHistory> {
    const { data, error } = await supabase
      .from('recurring_cost_history')
      .insert(input)
      .select()
      .single();
    if (error) throw error;
    return data as RecurringCostHistory;
  },
  async remove(id: string): Promise<void> {
    const { error } = await supabase
      .from('recurring_cost_history')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },
};
