/**
 * Shared LLM client for edge functions.
 * Providers: gemini (default) | xai
 * Returns OpenAI-style chat.completion JSON for drop-in replacement of Lovable gateway.
 */

export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool" | string;
  content: string | null;
  tool_calls?: ToolCall[];
  name?: string;
};

export type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type ChatTool = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
};

export type ChatCompletionRequest = {
  messages: ChatMessage[];
  model?: string;
  tools?: ChatTool[];
  tool_choice?: "auto" | "none" | "required" | string;
  stream?: boolean;
  temperature?: number;
};

export type ChatCompletionResponse = {
  id: string;
  object: "chat.completion";
  choices: Array<{
    index: number;
    message: {
      role: "assistant";
      content: string | null;
      tool_calls?: ToolCall[];
    };
    finish_reason: string;
  }>;
  provider?: string;
  model?: string;
};

function env(name: string, fallback = ""): string {
  return (Deno.env.get(name) || fallback).trim();
}

export function getLlmProvider(): "gemini" | "xai" {
  const p = env("LLM_PROVIDER", "gemini").toLowerCase();
  return p === "xai" || p === "grok" ? "xai" : "gemini";
}

export function getDefaultModel(): string {
  const provider = getLlmProvider();
  if (provider === "xai") {
    return env("XAI_MODEL", "grok-3-mini");
  }
  return env("GEMINI_MODEL", "gemini-flash-latest");
}

function stripLovableModelPrefix(model: string): string {
  // "google/gemini-2.5-flash" → prefer env default or flash-latest
  if (model.startsWith("google/")) {
    return getDefaultModel();
  }
  return model;
}

function ensureConfigured(): void {
  const provider = getLlmProvider();
  if (provider === "xai") {
    if (!env("XAI_API_KEY")) {
      throw new Error("XAI_API_KEY is not configured (LLM_PROVIDER=xai)");
    }
  } else {
    if (!env("GOOGLE_AI_API_KEY") && !env("GEMINI_API_KEY")) {
      throw new Error(
        "GOOGLE_AI_API_KEY (or GEMINI_API_KEY) is not configured for Gemini chat",
      );
    }
  }
}

function googleKey(): string {
  return env("GOOGLE_AI_API_KEY") || env("GEMINI_API_KEY");
}

/** Split system vs conversation for Gemini. */
function splitSystem(messages: ChatMessage[]): {
  system: string;
  rest: ChatMessage[];
} {
  const systemParts: string[] = [];
  const rest: ChatMessage[] = [];
  for (const m of messages) {
    if (m.role === "system") {
      if (m.content) systemParts.push(m.content);
    } else {
      rest.push(m);
    }
  }
  return { system: systemParts.join("\n\n"), rest };
}

function toGeminiContents(messages: ChatMessage[]): unknown[] {
  const contents: unknown[] = [];
  for (const m of messages) {
    if (m.role === "system") continue;

    // Tool / function results → user turn with JSON (compatible multi-turn)
    if (m.role === "tool" || m.role === "function") {
      const label = m.name ? `Verktyg ${m.name}` : "Verktygsresultat";
      contents.push({
        role: "user",
        parts: [{ text: `${label}:\n${m.content || "{}"}` }],
      });
      continue;
    }

    if (m.role === "assistant" && m.tool_calls?.length) {
      const parts: unknown[] = [];
      if (m.content) parts.push({ text: m.content });
      for (const tc of m.tool_calls) {
        let args: unknown = {};
        try {
          args = JSON.parse(tc.function.arguments || "{}");
        } catch {
          args = { raw: tc.function.arguments };
        }
        parts.push({
          functionCall: { name: tc.function.name, args },
        });
      }
      contents.push({ role: "model", parts: parts.length ? parts : [{ text: "(tool call)" }] });
      continue;
    }

    const role = m.role === "assistant" ? "model" : "user";
    const text = m.content || "";
    if (!text) continue;
    contents.push({
      role,
      parts: [{ text }],
    });
  }
  // Gemini needs at least one user turn
  if (contents.length === 0) {
    contents.push({ role: "user", parts: [{ text: "Hej" }] });
  }
  // Ensure first content is user
  const first = contents[0] as { role?: string };
  if (first?.role === "model") {
    contents.unshift({ role: "user", parts: [{ text: "(fortsätt)" }] });
  }
  return contents;
}

function toolsToGemini(tools?: ChatTool[]): unknown[] | undefined {
  if (!tools?.length) return undefined;
  return tools.map((t) => ({
    name: t.function.name,
    description: t.function.description || t.function.name,
    parameters: t.function.parameters || { type: "object", properties: {} },
  }));
}

function parseGeminiResponse(data: Record<string, unknown>, model: string): ChatCompletionResponse {
  const candidates = (data.candidates as Array<Record<string, unknown>>) || [];
  const cand = candidates[0] || {};
  const content = (cand.content as Record<string, unknown>) || {};
  const parts = (content.parts as Array<Record<string, unknown>>) || [];

  let text = "";
  const toolCalls: ToolCall[] = [];
  let i = 0;
  for (const part of parts) {
    if (typeof part.text === "string") {
      text += part.text;
    }
    const fc = part.functionCall as { name?: string; args?: unknown } | undefined;
    if (fc?.name) {
      toolCalls.push({
        id: `call_${Date.now()}_${i++}`,
        type: "function",
        function: {
          name: fc.name,
          arguments: JSON.stringify(fc.args ?? {}),
        },
      });
    }
  }

  const finish =
    toolCalls.length > 0
      ? "tool_calls"
      : String((cand.finishReason as string) || "stop").toLowerCase();

  return {
    id: `chatcmpl-gemini-${Date.now()}`,
    object: "chat.completion",
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: text || null,
          ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
        },
        finish_reason: finish,
      },
    ],
    provider: "gemini",
    model,
  };
}

async function geminiChat(
  req: ChatCompletionRequest,
): Promise<ChatCompletionResponse | Response> {
  const model = stripLovableModelPrefix(req.model || getDefaultModel());
  const key = googleKey();
  const { system, rest } = splitSystem(req.messages);
  const contents = toGeminiContents(rest);
  const fnDecls = toolsToGemini(req.tools);

  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      temperature: req.temperature ?? 0.4,
    },
  };
  if (system) {
    body.systemInstruction = { parts: [{ text: system }] };
  }
  if (fnDecls?.length) {
    body.tools = [{ functionDeclarations: fnDecls }];
    // Auto function calling when tools present
    body.toolConfig = {
      functionCallingConfig: {
        mode: req.tool_choice === "none" ? "NONE" : "AUTO",
      },
    };
  }

  if (req.stream) {
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${key}`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`Gemini stream ${resp.status}: ${errText.slice(0, 500)}`);
    }
    // Convert Gemini SSE → OpenAI-style SSE chunks (text only)
    const reader = resp.body?.getReader();
    if (!reader) {
      throw new Error("Gemini stream has no body");
    }
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    let buffer = "";

    const stream = new ReadableStream({
      async pull(controller) {
        const { done, value } = await reader.read();
        if (done) {
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
          return;
        }
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const payload = trimmed.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          try {
            const json = JSON.parse(payload);
            const parts = json?.candidates?.[0]?.content?.parts || [];
            let delta = "";
            for (const p of parts) {
              if (p.text) delta += p.text;
            }
            if (!delta) continue;
            const chunk = {
              id: `chatcmpl-gemini-stream`,
              object: "chat.completion.chunk",
              choices: [
                {
                  index: 0,
                  delta: { content: delta },
                  finish_reason: null,
                },
              ],
            };
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`),
            );
          } catch {
            // ignore partial JSON
          }
        }
      },
      cancel() {
        reader.cancel();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const errText = await resp.text();
    const err = new Error(`Gemini ${resp.status}: ${errText.slice(0, 800)}`);
    (err as Error & { status?: number }).status = resp.status;
    throw err;
  }
  const data = await resp.json();
  return parseGeminiResponse(data, model);
}

async function xaiChat(
  req: ChatCompletionRequest,
): Promise<ChatCompletionResponse | Response> {
  const model = req.model && !req.model.startsWith("google/")
    ? req.model
    : getDefaultModel();
  const key = env("XAI_API_KEY");
  const body: Record<string, unknown> = {
    model,
    messages: req.messages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
    stream: !!req.stream,
    temperature: req.temperature ?? 0.4,
  };
  if (req.tools?.length) {
    body.tools = req.tools;
    body.tool_choice = req.tool_choice || "auto";
  }

  const resp = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    const err = new Error(`xAI ${resp.status}: ${errText.slice(0, 800)}`);
    (err as Error & { status?: number }).status = resp.status;
    throw err;
  }

  if (req.stream) {
    return new Response(resp.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  const data = await resp.json();
  return {
    ...data,
    provider: "xai",
    model,
  } as ChatCompletionResponse;
}

/**
 * Chat completion — OpenAI-shaped result, or raw SSE Response when stream=true.
 */
export async function chatCompletion(
  req: ChatCompletionRequest,
): Promise<ChatCompletionResponse | Response> {
  ensureConfigured();
  const provider = getLlmProvider();
  if (provider === "xai") {
    return xaiChat(req);
  }
  return geminiChat(req);
}

/** Convenience: non-stream text only. */
export async function chatText(
  messages: ChatMessage[],
  opts?: { model?: string; temperature?: number },
): Promise<string> {
  const result = await chatCompletion({
    messages,
    model: opts?.model,
    temperature: opts?.temperature,
    stream: false,
  });
  if (result instanceof Response) {
    throw new Error("Unexpected stream response");
  }
  return result.choices?.[0]?.message?.content || "";
}

export function isLlmConfigured(): boolean {
  try {
    ensureConfigured();
    return true;
  } catch {
    return false;
  }
}
