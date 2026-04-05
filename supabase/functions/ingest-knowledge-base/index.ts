import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CHUNK_SIZE = 1500;
const CHUNK_OVERLAP = 200;
const BATCH_EMBED_LIMIT = 100;

function sanitizeText(text: string): string {
  return text
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, "")
    .replace(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "")
    .replace(/\0/g, "");
}

function chunkText(text: string): string[] {
  const paragraphPattern = /\n(?=\[K\d+\]\d+ §|\d+ §|Kap\.|Kapitel )/g;
  const sections = text.split(paragraphPattern).filter((s) => s.trim().length > 0);

  const chunks: string[] = [];
  let currentChunk = "";

  for (const section of sections) {
    if (currentChunk.length + section.length > CHUNK_SIZE && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      const overlapText = currentChunk.slice(-CHUNK_OVERLAP);
      currentChunk = overlapText + "\n" + section;
    } else {
      currentChunk += (currentChunk ? "\n" : "") + section;
    }
  }

  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim());
  }

  if (chunks.length <= 1 && text.length > CHUNK_SIZE) {
    chunks.length = 0;
    for (let i = 0; i < text.length; i += CHUNK_SIZE - CHUNK_OVERLAP) {
      chunks.push(text.slice(i, i + CHUNK_SIZE).trim());
    }
  }

  return chunks;
}

async function batchEmbed(texts: string[], apiKey: string, retries = 8): Promise<number[][]> {
  const requests = texts.map((text) => ({
    model: "models/gemini-embedding-001",
    content: { parts: [{ text }] },
    outputDimensionality: 768,
  }));

  for (let attempt = 0; attempt < retries; attempt++) {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requests }),
      }
    );

    if (resp.status === 429) {
      const wait = Math.min(2000 * Math.pow(2, attempt), 60000);
      console.log(`Rate limited, waiting ${wait}ms (attempt ${attempt + 1}/${retries})`);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`Batch embedding API error ${resp.status}: ${errText}`);
    }

    const data = await resp.json();
    return (data.embeddings || []).map((e: any) => e.values || []);
  }
  throw new Error("Batch embedding API: max retries exceeded (rate limited)");
}

async function embedAllChunks(texts: string[], apiKey: string): Promise<number[][]> {
  const results: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_EMBED_LIMIT) {
    const batch = texts.slice(i, i + BATCH_EMBED_LIMIT);
    console.log(`Batch embedding ${i + 1}-${i + batch.length} of ${texts.length}`);
    const embeddings = await batchEmbed(batch, apiKey);
    results.push(...embeddings);

    if (i + BATCH_EMBED_LIMIT < texts.length) {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  return results;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) throw new Error("Missing authorization header");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const GOOGLE_AI_API_KEY = Deno.env.get("GOOGLE_AI_API_KEY");
    if (!GOOGLE_AI_API_KEY) throw new Error("GOOGLE_AI_API_KEY is not configured");

    // Read body first (can only be read once)
    const body = await req.json();

    // Decode JWT to get user ID (no API call needed - just base64 decode the payload)
    const token = authHeader.replace("Bearer ", "");
    let userId: string;
    try {
      const payloadB64 = token.split(".")[1];
      const payload = JSON.parse(atob(payloadB64));
      userId = payload.sub;
      if (!userId) throw new Error("No sub in token");
    } catch {
      throw new Error("Invalid token");
    }

    // Check founder role
    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: roleData } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "founder")
      .maybeSingle();

    if (!roleData) throw new Error("Only founders can manage the knowledge base");

    // Handle delete
    if (body.action === "delete") {
      if (!body.source_key) throw new Error("Missing source_key for delete");
      const { error: delError } = await supabaseAdmin
        .from("knowledge_base_chunks")
        .delete()
        .eq("source_key", body.source_key);
      if (delError) throw delError;
      return new Response(JSON.stringify({ success: true, action: "deleted", source_key: body.source_key }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Handle list
    if (body.action === "list") {
      const { data: sources, error } = await supabaseAdmin
        .from("knowledge_base_chunks")
        .select("source_key, source_title")
        .order("source_key");
      if (error) throw error;

      // Deduplicate and count
      const sourceMap = new Map<string, { title: string; count: number }>();
      for (const s of sources || []) {
        if (!sourceMap.has(s.source_key)) {
          sourceMap.set(s.source_key, { title: s.source_title, count: 0 });
        }
        sourceMap.get(s.source_key)!.count++;
      }

      const result = Array.from(sourceMap.entries()).map(([key, val]) => ({
        source_key: key,
        source_title: val.title,
        chunk_count: val.count,
      }));

      return new Response(JSON.stringify({ success: true, sources: result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Ingest - accept both camelCase and snake_case
    const source_key = body.sourceKey || body.source_key;
    const source_title = body.sourceTitle || body.source_title;
    const content = body.content;
    if (!source_key || !source_title || !content) {
      throw new Error("Missing required fields: sourceKey, sourceTitle, content");
    }

    console.log(`Ingesting knowledge base: ${source_key} (${content.length} chars)`);

    const chunks = chunkText(content);
    console.log(`Created ${chunks.length} chunks`);

    const embeddings = await embedAllChunks(chunks, GOOGLE_AI_API_KEY);

    // Delete existing chunks for this source
    await supabaseAdmin
      .from("knowledge_base_chunks")
      .delete()
      .eq("source_key", source_key);

    const rows = chunks.map((chunk, i) => ({
      source_key,
      source_title,
      content: sanitizeText(chunk),
      chunk_index: i,
      embedding: JSON.stringify(embeddings[i]),
      token_count: Math.round(chunk.length / 4),
      metadata: {},
    }));

    // Insert in sub-batches of 50
    for (let i = 0; i < rows.length; i += 50) {
      const batch = rows.slice(i, i + 50);
      const { error: insertError } = await supabaseAdmin
        .from("knowledge_base_chunks")
        .insert(batch);
      if (insertError) throw insertError;
    }

    return new Response(
      JSON.stringify({
        success: true,
        source_key,
        source_title,
        chunksCreated: chunks.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("ingest-knowledge-base error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
