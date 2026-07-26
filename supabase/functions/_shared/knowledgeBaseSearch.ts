import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

export async function searchKnowledgeBase(query: string, matchCount = 5): Promise<string> {
  const GOOGLE_AI_API_KEY = Deno.env.get("GOOGLE_AI_API_KEY");
  if (!GOOGLE_AI_API_KEY) return "";

  try {
    // Generate embedding for the query
    const embRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${GOOGLE_AI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "models/gemini-embedding-001",
          content: { parts: [{ text: query }] },
          taskType: "RETRIEVAL_QUERY",
        }),
      }
    );

    if (!embRes.ok) return "";
    const embData = await embRes.json();
    const embedding = embData?.embedding?.values;
    if (!embedding?.length) return "";

    // Search knowledge base
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: chunks } = await supabaseClient.rpc("match_knowledge_base_chunks", {
      _embedding: JSON.stringify(embedding),
      _match_count: matchCount,
      _match_threshold: 0.35,
    });

    if (!chunks?.length) return "";

    return chunks
      .map((c: any) => `[${c.source_title}] ${c.content}`)
      .join("\n\n");
  } catch (e) {
    console.error("Knowledge base search error:", e);
    return "";
  }
}
