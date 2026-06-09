import { supabase } from '@/integrations/supabase/client';
import { createCrudService } from './createCrudService';
import type {
  Tables,
  TablesInsert,
  TablesUpdate,
} from '@/integrations/supabase/types';

export type AIConversation = Tables<'ai_conversations'>;
export type AIConversationInsert = TablesInsert<'ai_conversations'>;
export type AIConversationUpdate = TablesUpdate<'ai_conversations'>;
export interface AIConversationFilters {
  userId?: string;
  organizationId?: string;
}

export type AIMessage = Tables<'ai_messages'>;
export type AIMessageInsert = TablesInsert<'ai_messages'>;

export const aiConversationService = createCrudService<
  AIConversation,
  AIConversationInsert,
  AIConversationUpdate,
  AIConversationFilters
>({
  table: 'ai_conversations',
  defaultOrder: { column: 'updated_at', ascending: false },
  applyFilters: (q, f) => {
    let r = q;
    if (f.userId) r = r.eq('user_id', f.userId);
    if (f.organizationId) r = r.eq('organization_id', f.organizationId);
    return r;
  },
});

export const aiMessageService = {
  async listForConversation(conversationId: string): Promise<AIMessage[]> {
    const { data, error } = await supabase
      .from('ai_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []) as AIMessage[];
  },
  async create(input: AIMessageInsert): Promise<AIMessage> {
    const { data, error } = await supabase
      .from('ai_messages')
      .insert(input)
      .select()
      .single();
    if (error) throw error;
    return data as AIMessage;
  },
};
