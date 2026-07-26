import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { invokeEdgeFunction, invokeEdgeFunctionRaw } from '@/services/supabase';

/**
 * Dedicated React Query hooks for each Supabase Edge Function used in the app.
 * Components should call these instead of `supabase.functions.invoke(...)`.
 *
 * Each hook returns a `useMutation` instance so call sites get loading/error
 * state, retries, and consistent error semantics for free.
 */

// ---------- AI: chat / protocol / actions ----------

export interface AIChatBody {
  message?: string;
  messages?: Array<{ role: string; content: string }>;
  conversationId?: string;
  [key: string]: unknown;
}

/**
 * AI chat with automatic session refresh on 401 (see ai-chat-auth-resiliency).
 */
export function useAIChat() {
  return useMutation({
    mutationFn: async (body: AIChatBody) => {
      const first = await invokeEdgeFunctionRaw('ai-chat', body);
      if (!first.error) return first.data;

      const status = (first.error as { context?: { status?: number } })?.context?.status;
      if (status !== 401) throw first.error;

      const { error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) throw refreshError;

      return invokeEdgeFunction('ai-chat', body);
    },
  });
}

export function useAnalyzeProtocol() {
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      invokeEdgeFunction('analyze-protocol', body),
  });
}

export interface ExecuteAIActionBody {
  actionId: string;
  [key: string]: unknown;
}

export function useExecuteAIAction() {
  return useMutation({
    mutationFn: (body: ExecuteAIActionBody) =>
      invokeEdgeFunction('execute-ai-action', body),
  });
}

// ---------- Embeddings ----------

export function useGenerateEmbeddings() {
  return useMutation({
    mutationFn: () => invokeEdgeFunction('generate-embeddings'),
  });
}

export function useBackfillEmbeddings() {
  return useMutation({
    mutationFn: (body?: Record<string, unknown>) =>
      invokeEdgeFunction('backfill-embeddings', body),
  });
}

// ---------- Work orders ----------

export function useGenerateOrderText() {
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      invokeEdgeFunction('generate-order-text', body),
  });
}

export function useSendWorkOrderDraft() {
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      invokeEdgeFunction('send-work-order-draft', body),
  });
}

// ---------- Projects ----------

export function useGenerateProjectOrderText() {
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      invokeEdgeFunction('generate-project-order-text', body),
  });
}

export function useSendProjectOrderDraft() {
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      invokeEdgeFunction('send-project-order-draft', body),
  });
}

// ---------- Reports ----------

export function usePreviewReport() {
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      invokeEdgeFunction('preview-report', body),
  });
}

// ---------- Properties / organization ----------

export function useSendPropertyInfo() {
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      invokeEdgeFunction('send-property-info', body),
  });
}

export function useExportOrganizationData() {
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      invokeEdgeFunction<{ csv?: string; url?: string; [k: string]: unknown }>(
        'export-organization-data',
        body
      ),
  });
}
