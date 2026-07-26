import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface RateLimitConfig {
  endpoint: string;
  maxRequests: number;
  windowSeconds: number;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds?: number;
}

export async function checkRateLimit(
  userId: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const windowStart = new Date(Date.now() - config.windowSeconds * 1000).toISOString();

  // Count recent requests in window
  const { data, error } = await supabase
    .from('api_rate_limits')
    .select('request_count, window_start')
    .eq('user_id', userId)
    .eq('endpoint', config.endpoint)
    .gte('window_start', windowStart)
    .order('window_start', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('Rate limit check error:', error);
    // Fail open - allow request if rate limiting fails
    return { allowed: true, remaining: config.maxRequests };
  }

  const currentCount = data?.request_count || 0;

  if (currentCount >= config.maxRequests) {
    const windowStartTime = data?.window_start ? new Date(data.window_start).getTime() : Date.now();
    const retryAfter = Math.ceil((windowStartTime + config.windowSeconds * 1000 - Date.now()) / 1000);
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, retryAfter),
    };
  }

  // Upsert the counter
  if (data) {
    await supabase
      .from('api_rate_limits')
      .update({ request_count: currentCount + 1 })
      .eq('user_id', userId)
      .eq('endpoint', config.endpoint)
      .eq('window_start', data.window_start);
  } else {
    await supabase
      .from('api_rate_limits')
      .insert({
        user_id: userId,
        endpoint: config.endpoint,
        request_count: 1,
        window_start: new Date().toISOString(),
      });
  }

  return { allowed: true, remaining: config.maxRequests - currentCount - 1 };
}

export function rateLimitResponse(
  result: RateLimitResult,
  corsHeaders: Record<string, string>
): Response | null {
  if (result.allowed) return null;

  return new Response(
    JSON.stringify({ error: 'Rate limit exceeded. Try again later.' }),
    {
      status: 429,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Retry-After': String(result.retryAfterSeconds || 60),
      },
    }
  );
}
