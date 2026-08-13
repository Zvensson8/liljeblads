/**
 * Shared LLM client for edge functions.
 *
 * Default: xAI Grok when XAI_API_KEY is set (user goal: Grok for Jarvis).
 * Fallback: Gemini when only Google keys exist.
 *
 * Cost control (avoid ~$100/mo):
 * - Default model grok-4.3 (~$1.25 in / $2.50 out per 1M) — strong tools, not flagship
 * - Do NOT default to grok-4.5/4.6 ($2/$6) unless XAI_MODEL is set explicitly
 * - Cap max_tokens + trim history
 * - Low reasoning_effort when supported (cheaper / fewer thinking tokens)
 * - Log usage when API returns it
 */

export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool" | string;
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
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
  max_tokens?: number;
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
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  provider?: string;
  model?: string;
};

function env(name: string, fallback = ""): string {
  return (Deno.env.get(name) || fallback).trim();
}

/**
 * Prefer xAI when key present (user goal: Grok).
 * Explicit LLM_PROVIDER=gemini forces Gemini even with both keys.
 */
export function getLlmProvider(): "gemini" | "xai" {
  const forced = env("LLM_PROVIDER", "").toLowerCase();
  if (forced === "gemini" || forced === "google") return "gemini";
  if (forced === "xai" || forced === "grok") return "xai";
  if (env("XAI_API_KEY")) return "xai";
  return "gemini";
}

/**
 * Cost-efficient default: grok-4.3 (strong tool calling, ~$1.25/$2.50 per 1M).
 * ~5–10× cheaper than flagship grok-4.6 ($2/$6). Fast models (4-1-fast) retired → 4.3.
 * Override with XAI_MODEL=grok-4.6 only if you need max intelligence and accept higher spend.
 */
export function getDefaultModel(): string {
  const provider = getLlmProvider();
  if (provider === "xai") {
    return normalizeModelId(env("XAI_MODEL", "grok-4.3") || "grok-4.3");
  }
  return env("GEMINI_MODEL", "gemini-flash-latest");
}

/** Soft cap on completion size to control spend */
export function getDefaultMaxTokens(): number {
  const n = Number(env("LLM_MAX_TOKENS", "2048"));
  if (!Number.isFinite(n) || n < 256) return 2048;
  return Math.min(Math.floor(n), 8192);
}

/** Keep last N user/assistant turns (+ tools) to control context cost */
export function trimMessagesForCost(
  messages: ChatMessage[],
  maxMessages = Number(env("LLM_MAX_HISTORY_MESSAGES", "24")),
): ChatMessage[] {
  if (messages.length <= maxMessages) return messages;
  const system = messages.filter((m) => m.role === "system");
  const rest = messages.filter((m) => m.role !== "system");
  const kept = rest.slice(-Math.max(8, maxMessages - system.length));
  // Ensure we don't start mid-tool chain awkwardly
  while (
    kept.length &&
    (kept[0].role === "tool" ||
      (kept[0].role === "assistant" && kept[0].tool_calls?.length))
  ) {
    kept.shift();
  }
  return [...system, ...kept];
}

function normalizeModelId(model: string): string {
  if (model.startsWith("google/")) {
    return getDefaultModel();
  }
  // Retired fast slugs → current cost-efficient model
  if (
    model === "grok-4-1-fast" ||
    model === "grok-4-1-fast-reasoning" ||
    model === "grok-4-1-fast-non-reasoning" ||
    model === "grok-4-fast" ||
    model === "grok-4-fast-reasoning" ||
    model === "grok-4-fast-non-reasoning"
  ) {
    return "grok-4.3";
  }
  return model;
}

function ensureConfigured(): void {
  const provider = getLlmProvider();
  if (provider === "xai") {
    if (!env("XAI_API_KEY")) {
      throw new Error("XAI_API_KEY is not configured (LLM_PROVIDER=xai / Grok)");
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
      contents.push({
        role: "model",
        parts: parts.length ? parts : [{ text: "(tool call)" }],
      });
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
  if (contents.length === 0) {
    contents.push({ role: "user", parts: [{ text: "Hej" }] });
  }
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

function parseGeminiResponse(
  data: Record<string, unknown>,
  model: string,
): ChatCompletionResponse {
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
  const model = normalizeModelId(req.model || getDefaultModel());
  const key = googleKey();
  const { system, rest } = splitSystem(req.messages);
  const contents = toGeminiContents(rest);
  const fnDecls = toolsToGemini(req.tools);

  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      temperature: req.temperature ?? 0.4,
      maxOutputTokens: req.max_tokens ?? getDefaultMaxTokens(),
    },
  };
  if (system) {
    body.systemInstruction = { parts: [{ text: system }] };
  }
  if (fnDecls?.length) {
    body.tools = [{ functionDeclarations: fnDecls }];
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

/** Map our messages to OpenAI/xAI chat format including tool rounds */
function toXaiMessages(messages: ChatMessage[]): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const m of messages) {
    if (m.role === "tool") {
      out.push({
        role: "tool",
        tool_call_id: m.tool_call_id || m.name || "tool",
        content: m.content ?? "",
        ...(m.name ? { name: m.name } : {}),
      });
      continue;
    }
    if (m.role === "assistant" && m.tool_calls?.length) {
      out.push({
        role: "assistant",
        content: m.content,
        tool_calls: m.tool_calls.map((tc) => ({
          id: tc.id,
          type: "function",
          function: {
            name: tc.function.name,
            arguments: tc.function.arguments || "{}",
          },
        })),
      });
      continue;
    }
    out.push({
      role: m.role,
      content: m.content,
    });
  }
  return out;
}

function logUsage(
  provider: string,
  model: string,
  usage?: ChatCompletionResponse["usage"],
): void {
  if (!usage) return;
  console.log(
    `[llm] provider=${provider} model=${model} prompt=${usage.prompt_tokens ?? "?"} completion=${usage.completion_tokens ?? "?"} total=${usage.total_tokens ?? "?"}`,
  );
}

async function xaiChat(
  req: ChatCompletionRequest,
): Promise<ChatCompletionResponse | Response> {
  const model =
    req.model && !req.model.startsWith("google/")
      ? normalizeModelId(req.model)
      : getDefaultModel();
  const key = env("XAI_API_KEY");
  const messages = trimMessagesForCost(req.messages);

  const body: Record<string, unknown> = {
    model,
    messages: toXaiMessages(messages),
    stream: !!req.stream,
    temperature: req.temperature ?? 0.3,
    max_tokens: req.max_tokens ?? getDefaultMaxTokens(),
  };
  if (req.tools?.length) {
    body.tools = req.tools;
    body.tool_choice = req.tool_choice || "auto";
  }
  // Flagship models default to high reasoning (expensive). Prefer low for agentic chat.
  if (/^grok-4\.(5|6)/.test(model)) {
    const effort = env("XAI_REASONING_EFFORT", "low");
    if (effort) body.reasoning_effort = effort;
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
    const hint = /model/i.test(errText)
      ? " Kontrollera XAI_MODEL (rekommenderat: grok-4.3; flagship: grok-4.6)."
      : "";
    const err = new Error(
      `xAI ${resp.status}: ${errText.slice(0, 800)}${hint}`,
    );
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
  logUsage("xai", model, data.usage);
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

export function getLlmStatus(): {
  provider: string;
  model: string;
  configured: boolean;
} {
  try {
    ensureConfigured();
    return {
      provider: getLlmProvider(),
      model: getDefaultModel(),
      configured: true,
    };
  } catch {
    return { provider: "none", model: "", configured: false };
  }
}
