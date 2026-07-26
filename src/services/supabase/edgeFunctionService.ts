import { supabase } from '@/integrations/supabase/client';

export interface InvokeOptions {
  headers?: Record<string, string>;
}

/**
 * Error thrown by `invokeEdgeFunction` with a normalized, Swedish
 * user-facing message plus the raw status/cause for programmatic use.
 */
export class EdgeFunctionError extends Error {
  status?: number;
  functionName: string;

  constructor(functionName: string, message: string, status?: number, cause?: unknown) {
    super(message);
    this.name = 'EdgeFunctionError';
    this.functionName = functionName;
    this.status = status;
    (this as { cause?: unknown }).cause = cause;
  }
}

function mapStatusMessage(status: number | undefined, fallback: string): string {
  switch (status) {
    case 401:
      return 'Sessionen har gått ut. Logga in igen och försök på nytt.';
    case 403:
      return 'Du saknar behörighet för den här åtgärden.';
    case 404:
      return 'Tjänsten kunde inte hittas.';
    case 413:
      return 'Filen eller innehållet är för stort.';
    case 429:
      return 'För många försök — vänta en stund och försök igen.';
    case 500:
    case 502:
    case 503:
    case 504:
      return 'Serverfel — försök igen om en stund.';
    default:
      return fallback || 'Något gick fel. Försök igen.';
  }
}

function normalizeError(name: string, error: unknown): EdgeFunctionError {
  const status = (error as { context?: { status?: number } })?.context?.status;
  const raw = (error as { message?: string })?.message ?? '';
  return new EdgeFunctionError(name, mapStatusMessage(status, raw), status, error);
}

/**
 * Typed wrapper around `supabase.functions.invoke` with consistent error
 * handling. Throws `EdgeFunctionError` with a user-friendly Swedish message.
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
  if (error) throw normalizeError(name, error);
  return data as TResponse;
}

/**
 * Raw invoke that returns both data and error — for call sites that need to
 * inspect the raw error object (e.g. retry-on-401 flows).
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
