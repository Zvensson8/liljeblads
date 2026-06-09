import { supabase } from '@/integrations/supabase/client';

export interface InvokeOptions {
  headers?: Record<string, string>;
}

/**
 * Typed wrapper around `supabase.functions.invoke` with consistent error handling.
 * Domain-specific hooks should call this rather than the raw client.
 */
export async function invokeEdgeFunction<TResponse = unknown, TBody = unknown>(
  name: string,
  body?: TBody,
  options: InvokeOptions = {}
): Promise<TResponse> {
  const { data, error } = await supabase.functions.invoke(name, {
    body: body as Record<string, unknown> | undefined,
    headers: options.headers,
  });
  if (error) throw error;
  return data as TResponse;
}

/**
 * Raw invoke that returns both data and error — for call sites that need to
 * inspect the error object (e.g. retry-on-401 flows).
 */
export async function invokeEdgeFunctionRaw<TResponse = unknown, TBody = unknown>(
  name: string,
  body?: TBody,
  options: InvokeOptions = {}
) {
  return supabase.functions.invoke(name, {
    body: body as Record<string, unknown> | undefined,
    headers: options.headers,
  }) as Promise<{ data: TResponse | null; error: Error | null }>;
}
