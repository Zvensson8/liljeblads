import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (req) => {
  const apiKey = Deno.env.get('GOOGLE_AI_API_KEY');
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'No API key' }), { status: 500 });
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
  );
  const data = await response.json();
  
  const embeddingModels = (data.models || [])
    .filter((m: any) => m.supportedGenerationMethods?.includes('embedContent'))
    .map((m: any) => ({ name: m.name, methods: m.supportedGenerationMethods }));

  return new Response(JSON.stringify({ embeddingModels, allCount: data.models?.length }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
