import { createCrudService } from './createCrudService';
import type { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';

export type AISuggestedAction = Tables<'ai_suggested_actions'>;
export type AISuggestedActionInsert = TablesInsert<'ai_suggested_actions'>;
export type AISuggestedActionUpdate = TablesUpdate<'ai_suggested_actions'>;
export interface AISuggestedActionFilters {
  organizationId?: string;
  conversationId?: string;
  status?: string;
  actionType?: string;
  targetTable?: string;
  targetId?: string;
}

export const aiSuggestedActionService = createCrudService<
  AISuggestedAction,
  AISuggestedActionInsert,
  AISuggestedActionUpdate,
  AISuggestedActionFilters
>({
  table: 'ai_suggested_actions',
  defaultOrder: { column: 'created_at', ascending: false },
  applyFilters: (q, f) => {
    let r = q;
    if (f.organizationId) r = r.eq('organization_id', f.organizationId);
    if (f.conversationId) r = r.eq('conversation_id', f.conversationId);
    if (f.status) r = r.eq('status', f.status);
    if (f.actionType) r = r.eq('action_type', f.actionType);
    if (f.targetTable) r = r.eq('target_table', f.targetTable);
    if (f.targetId) r = r.eq('target_id', f.targetId);
    return r;
  },
});
