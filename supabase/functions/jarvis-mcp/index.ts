/**
 * MCP (Streamable HTTP + JSON-RPC) for xAI Voice Agent Builder / phone Jarvis.
 * Auth: Authorization: Bearer lbl_…
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { resolveApiKeyCaller } from "../_shared/apiKeyAuth.ts";
import { executeJarvisTool } from "../_shared/jarvisTools.ts";
import { voiceAgentTools } from "../_shared/voiceAgentTools.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, mcp-session-id, mcp-protocol-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

type JsonRpc = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function rpcResult(id: JsonRpc["id"], result: unknown) {
  return { jsonrpc: "2.0", id: id ?? null, result };
}

function rpcError(id: JsonRpc["id"], code: number, message: string) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

function mcpTools() {
  return voiceAgentTools().map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.parameters,
  }));
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method === "GET") {
    return json({
      name: "liljeblads-jarvis",
      transport: "streamable-http",
      hint: "POST JSON-RPC (initialize, tools/list, tools/call) with Bearer lbl_…",
    });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const resolved = await resolveApiKeyCaller(req);
  if (!resolved.ok) return json({ error: resolved.error }, resolved.status);
  const { caller } = resolved;

  const payload = await req.json().catch(() => null);
  const messages: JsonRpc[] = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object"
    ? [payload as JsonRpc]
    : [];

  if (!messages.length) {
    return json(rpcError(null, -32700, "Parse error"), 400);
  }

  const replies = [];
  for (const msg of messages) {
    const id = msg.id ?? null;
    const method = String(msg.method || "");

    if (method === "initialize") {
      const clientVer = String(
        (msg.params as { protocolVersion?: string } | undefined)?.protocolVersion ||
          "2025-03-26",
      );
      replies.push(
        rpcResult(id, {
          protocolVersion: clientVer.startsWith("2024") ? clientVer : "2025-03-26",
          capabilities: { tools: { listChanged: false } },
          serverInfo: {
            name: "liljeblads-jarvis",
            version: "1.0.0",
            title: "Jarvis (Liljeblads)",
          },
          instructions:
            "Du är Jarvis. Prata svenska, kort som en kollega. Använd verktyg för fakta. Arkivera/status körs direkt.",
        }),
      );
      continue;
    }

    if (method === "notifications/initialized" || method === "notifications/cancelled") {
      continue;
    }

    if (method === "ping") {
      replies.push(rpcResult(id, {}));
      continue;
    }

    if (method === "tools/list") {
      replies.push(rpcResult(id, { tools: mcpTools() }));
      continue;
    }

    if (method === "resources/list" || method === "prompts/list") {
      replies.push(rpcResult(id, { resources: [], prompts: [] }));
      continue;
    }

    if (method === "tools/call") {
      const name = String(msg.params?.name || "").trim();
      const args = (msg.params?.arguments && typeof msg.params.arguments === "object"
        ? msg.params.arguments
        : {}) as Record<string, unknown>;
      if (!name) {
        replies.push(rpcError(id, -32602, "name krävs"));
        continue;
      }
      try {
        let userId = caller.userId;
        if (!userId) {
          const { data: member } = await caller.supabase
            .from("organization_members")
            .select("user_id")
            .eq("organization_id", caller.orgId)
            .limit(1)
            .maybeSingle();
          userId = (member?.user_id as string | undefined) ?? null;
        }
        const result = await executeJarvisTool(name, args, {
          supabase: caller.supabase,
          orgId: caller.orgId,
          userId: userId || "00000000-0000-0000-0000-000000000000",
          userEmail: null,
          memberRole: "owner",
          pageContext: null,
        });
        const text = JSON.stringify(result).slice(0, 12000);
        const isError = !!(result && typeof result === "object" && "error" in (result as object));
        replies.push(
          rpcResult(id, {
            content: [{ type: "text", text }],
            isError,
          }),
        );
      } catch (e) {
        replies.push(
          rpcResult(id, {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  error: e instanceof Error ? e.message : "tool failed",
                }),
              },
            ],
            isError: true,
          }),
        );
      }
      continue;
    }

    replies.push(rpcError(id, -32601, `Unknown method: ${method}`));
  }

  if (!replies.length) {
    return new Response(null, { status: 202, headers: corsHeaders });
  }

  const accept = req.headers.get("accept") || "";
  const body = replies.length === 1 ? replies[0] : replies;

  if (accept.includes("text/event-stream")) {
    const ev = `event: message\ndata: ${JSON.stringify(body)}\n\n`;
    return new Response(ev, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
      },
    });
  }

  return json(body);
});
