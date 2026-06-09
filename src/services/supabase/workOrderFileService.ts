import { createCrudService } from './createCrudService';
import type { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';

export type WorkOrderFile = Tables<'work_order_files'>;
export type WorkOrderFileInsert = TablesInsert<'work_order_files'>;
export type WorkOrderFileUpdate = TablesUpdate<'work_order_files'>;
export interface WorkOrderFileFilters {
  workOrderId?: string;
}

export const workOrderFileService = createCrudService<
  WorkOrderFile,
  WorkOrderFileInsert,
  WorkOrderFileUpdate,
  WorkOrderFileFilters
>({
  table: 'work_order_files',
  defaultOrder: { column: 'created_at', ascending: false },
  applyFilters: (q, f) =>
    f.workOrderId ? q.eq('work_order_id', f.workOrderId) : q,
});
