/**
 * Hooks for `ai_conversations` and `ai_messages`.
 *
 * Conversations use the standard CRUD hook factory. Messages get a
 * dedicated `useAIMessages(conversationId)` reader and a create
 * mutation that invalidates the per-conversation cache.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { createEntityHooks } from '@/hooks/internal/createEntityHooks';
import { useRealtimeInvalidation } from '@/hooks/internal/useRealtimeInvalidation';
import { queryKeys } from '@/lib/queryKeys';
import { aiConversationService, aiMessageService } from '@/services/supabase';
import type {
  AIConversation,
  AIConversationInsert,
  AIConversationUpdate,
  AIConversationFilters,
  AIMessage,
  AIMessageInsert,
} from '@/services/supabase';

export type {
  AIConversation,
  AIConversationInsert,
  AIConversationUpdate,
  AIConversationFilters,
  AIMessage,
  AIMessageInsert,
};

const conversationHooks = createEntityHooks<
  AIConversation,
  AIConversationInsert,
  AIConversationUpdate,
  AIConversationFilters
>({
  service: aiConversationService,
  keys: queryKeys.aiConversations,
  realtimeTable: 'ai_conversations',
  labels: {
    deletedToast: 'Konversation borttagen',
    createErrorTitle: 'Kunde inte skapa konversation',
    updateErrorTitle: 'Kunde inte uppdatera konversation',
    deleteErrorTitle: 'Kunde inte ta bort konversation',
  },
});

export const useAIConversations = conversationHooks.useList;
export const useAIConversation = conversationHooks.useGetById;
export const useCreateAIConversation = conversationHooks.useCreate;
export const useUpdateAIConversation = conversationHooks.useUpdate;
export const useDeleteAIConversation = conversationHooks.useRemove;

export function useAIMessages(conversationId: string | undefined) {
  const { session } = useAuth();
  useRealtimeInvalidation('ai_messages', queryKeys.aiMessages.all);
  return useQuery<AIMessage[]>({
    queryKey: queryKeys.aiMessages.byConversation(conversationId ?? ''),
    queryFn: () =>
      conversationId
        ? aiMessageService.listForConversation(conversationId)
        : Promise.resolve([]),
    enabled: !!session && !!conversationId,
    staleTime: 1000 * 30,
  });
}

export function useCreateAIMessage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (input: AIMessageInsert) => aiMessageService.create(input),
    onSuccess: (msg) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.aiMessages.byConversation(msg.conversation_id),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.aiConversations.all });
    },
    onError: (error: Error) => {
      toast({
        title: 'Kunde inte skicka meddelande',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}
