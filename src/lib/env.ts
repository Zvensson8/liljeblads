/**
 * Validated frontend environment. Fails fast at boot if misconfigured.
 */

function required(name: string): string {
  const value = import.meta.env[name] as string | undefined;
  if (!value || !String(value).trim()) {
    throw new Error(
      `Saknad miljövariabel: ${name}. Kopiera .env.example till .env och fyll i Supabase-uppgifter.`,
    );
  }
  return String(value).trim().replace(/^["']|["']$/g, "");
}

export const env = {
  supabaseUrl: required("VITE_SUPABASE_URL"),
  supabasePublishableKey: required("VITE_SUPABASE_PUBLISHABLE_KEY"),
  supabaseProjectId:
    (import.meta.env.VITE_SUPABASE_PROJECT_ID as string | undefined)?.trim() ||
    undefined,
  isDev: import.meta.env.DEV,
  isProd: import.meta.env.PROD,
} as const;

// Sanity: URL should look like a Supabase project URL
if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(env.supabaseUrl.replace(/\/$/, ""))) {
  console.warn(
    `[env] VITE_SUPABASE_URL ser inte ut som en standard Supabase-URL: ${env.supabaseUrl}`,
  );
}

export function functionsUrl(functionName: string): string {
  const base = env.supabaseUrl.replace(/\/$/, "");
  return `${base}/functions/v1/${functionName}`;
}
