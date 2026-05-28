import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  BLOXSMITH_MODEL,
  BLOXSMITH_THINK_MODEL,
  BLOXSMITH_FAST_MODEL,
  BLOXSMITH_LARGE_MODEL,
  createGroqProvider,
} from "./ai-gateway.server";
import { SITE_PROVIDER_DEFAULT_MODEL, SITE_PROVIDER_MODELS } from "./ai-models";

export type ProviderId = "openai" | "anthropic" | "google" | "groq" | "neokens";
export type ModelKind = "chat" | "build" | "fast" | "large";

export type ModelProfile = {
  inputTokenBudget: number;
  maxOutputTokens: number;
  chatOutputTokens: number;
  timeoutMs: number;
  chatTimeoutMs: number;
  stopSteps: number;
  supportsTools: boolean;
  supportsVision: boolean;
  historyTurns: number;
  historyChars: number;
};

export type ProviderHealthEvent = {
  feature: "chat" | "build" | "plan" | "fix" | "other";
  provider: ProviderId;
  model: string;
  source?: "mcp" | "api_key";
  ok: boolean;
  durationMs?: number;
  errorKind?: "timeout" | "context" | "rate_limit" | "tool" | "json" | "provider" | "unknown";
  projectId?: string | null;
  userId?: string | null;
};

export async function recordProviderHealth(event: ProviderHealthEvent): Promise<void> {
  const row = {
    user_id: event.userId ?? null,
    project_id: event.projectId ?? null,
    feature: event.feature,
    provider: event.provider,
    model: event.model,
    source: event.source ?? null,
    ok: event.ok,
    duration_ms: event.durationMs ?? null,
    error_kind: event.errorKind ?? null,
  };

  try {
    const client = supabaseAdmin as any;
    const { error } = await client.from("ai_provider_events").insert(row);
    if (error && !/relation .*ai_provider_events.* does not exist/i.test(error.message ?? "")) {
      console.warn("[ai-provider-health] insert failed:", error.message);
    }
  } catch (err) {
    console.warn("[ai-provider-health] skipped:", err);
  }
}

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google Gemini",
  groq: "Groq",
  neokens: "Neokens (multi-model)",
};

// Curated model lists per provider. Keep the lists short — only models that
// reliably handle Lua/Luau and tool calling.
export const PROVIDER_MODELS: Record<ProviderId, string[]> = {
  openai: [
    "gpt-5.5",
    "gpt-5",
    "gpt-5-mini",
    "gpt-5-nano",
    "gpt-5-codex",
    "gpt-4.1",
    "gpt-4.1-mini",
  ],
  anthropic: [
    "claude-sonnet-4-6",
    "claude-sonnet-4-5",
    "claude-opus-4-1",
    "claude-3-5-sonnet-latest",
    "claude-3-5-haiku-latest",
  ],
  google: ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-3-flash-preview"],
  groq: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"],
  // Neokens proxies many models behind a single key — see neokens.com/docs.
  // We list whichever Neokens has working on their side at the moment;
  // Claude Sonnet 4.6/4.7 were tried and removed (Bad Gateway from Neokens).
  neokens: [...SITE_PROVIDER_MODELS.neokens],
};

export const PROVIDER_DEFAULT_MODEL: Record<ProviderId, string> = {
  openai: "gpt-5.5",
  anthropic: "claude-sonnet-4-6",
  google: "gemini-2.5-flash",
  groq: "llama-3.3-70b-versatile",
  neokens: SITE_PROVIDER_DEFAULT_MODEL.neokens,
};

// Some model IDs in the UI are virtual aliases — they map to a real provider
// model plus a request-time flag. The "-thinking" variants reuse the same
// underlying model with adaptive thinking enabled at call time.
//
// Note: previous claude-sonnet-4-6/4-7 thinking aliases were removed after
// Neokens returned Bad Gateway on both. Restore those entries here if/when
// Neokens supports the underlying models.
const VIRTUAL_MODEL_ALIASES: Record<string, { realModel: string; thinking?: boolean }> = {};

/**
 * Resolves a user-facing model ID (which may be a virtual alias like
 * "claude-sonnet-4-6-thinking") to the real model name the provider's API
 * actually accepts, plus any implicit request flags (thinking on/off).
 */
export function resolveModelAlias(modelName: string): { realModel: string; thinking: boolean } {
  const alias = VIRTUAL_MODEL_ALIASES[modelName];
  if (alias) return { realModel: alias.realModel, thinking: !!alias.thinking };
  return { realModel: modelName, thinking: false };
}

export function getModelProfile(
  provider: ProviderId,
  modelName: string,
  opts: { thinking?: boolean; heavyBuild?: boolean; retry?: boolean } = {},
): ModelProfile {
  const id = modelName.toLowerCase();
  const isSmall =
    id.includes("8b") ||
    id.includes("9b") ||
    id.includes("nano") ||
    id.includes("flash-lite") ||
    id.includes("haiku");
  const isHuge =
    id.includes("gemini-3.1") ||
    id.includes("gemini-2.5-pro") ||
    id.includes("claude-opus") ||
    id.includes("gpt-5-codex") ||
    id.includes("gpt-5.3") ||
    id.includes("gpt-5.4") ||
    id.includes("gpt-5.5") ||
    id.includes("70b") ||
    id.includes("sonnet");
  const isGemini = provider === "google" || id.includes("gemini");
  const isOpenAI = provider === "openai" || id.includes("gpt-");
  const isClaude = provider === "anthropic" || id.includes("claude");

  const inputTokenBudget = isHuge ? 100_000 : isSmall ? 12_000 : 32_000;
  const maxOutputTokens = opts.thinking
    ? isHuge
      ? 16_000
      : 9_000
    : opts.retry
      ? isHuge
        ? 8_000
        : 5_500
      : opts.heavyBuild
        ? isHuge
          ? 10_000
          : 6_500
        : isHuge
          ? 6_500
          : 4_500;

  return {
    inputTokenBudget,
    maxOutputTokens,
    chatOutputTokens: opts.thinking ? (isHuge ? 2_000 : 1_600) : isSmall ? 700 : 1_100,
    // Timeouts. These were tightened in an earlier pass and combined with
    // the expanded system prompt produced 502 Bad Gateway errors on
    // heavier builds when Cloudflare's worker wall-time ran out before
    // the upstream model finished streaming. Restored to generous values
    // so the bigger prompt has room to complete; perceived speed comes
    // from the model and prompt upgrades, not from cutting the timeout.
    timeoutMs: opts.thinking ? 45_000 : opts.heavyBuild ? 42_000 : isSmall ? 20_000 : 30_000,
    chatTimeoutMs: opts.thinking ? 40_000 : isSmall ? 12_000 : 18_000,
    stopSteps: opts.thinking ? 12 : isSmall ? 3 : 6,
    supportsTools: !opts.retry && !(provider === "groq" && id.includes("gemma")),
    supportsVision:
      isGemini ||
      isClaude ||
      (isOpenAI && !id.includes("nano")) ||
      (provider === "neokens" &&
        (id.includes("gemini") || id.includes("gpt-5") || id.includes("claude"))),
    historyTurns: opts.thinking ? (isHuge ? 8 : 5) : isSmall ? 3 : 5,
    historyChars: opts.thinking ? (isHuge ? 1_800 : 1_200) : isSmall ? 700 : 1_000,
  };
}

const NEOKENS_MODEL_BY_KIND: Record<ModelKind, string> = {
  chat: "gemini-3-flash",
  build: "gemini-3-flash",
  fast: "gemini-3-flash",
  large: "gemini-3.1-pro",
};

const sanitizingFetch: typeof fetch = async (input, init) => {
  if (init?.body && typeof init.body === "string") {
    try {
      const parsed = JSON.parse(init.body);
      if (Array.isArray(parsed?.messages)) {
        parsed.messages = parsed.messages.map((m: any) => {
          if (!m || typeof m !== "object") return m;
          const { reasoning_content, reasoning, ...rest } = m;
          return rest;
        });
        init = { ...init, body: JSON.stringify(parsed) };
      }
    } catch {
      // Leave non-JSON request bodies untouched.
    }
  }
  return fetch(input as any, init);
};

function providerEndpoint(provider: ProviderId): { name: string; baseURL: string } {
  switch (provider) {
    case "openai":
      return { name: "openai", baseURL: "https://api.openai.com/v1" };
    case "groq":
      return { name: "groq", baseURL: "https://api.groq.com/openai/v1" };
    // Anthropic and Google both expose OpenAI-compatible endpoints
    case "anthropic":
      return { name: "anthropic", baseURL: "https://api.anthropic.com/v1" };
    case "google":
      return {
        name: "google",
        baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
      };
    case "neokens":
      // Neokens credits gateway — OpenAI-compatible, one key for many models.
      return { name: "neokens", baseURL: "https://api.quatarly.cloud/v1" };
  }
}

export function createProvider(provider: ProviderId, apiKey: string): (modelId: string) => any {
  const { name, baseURL } = providerEndpoint(provider);
  return createOpenAICompatible({
    name,
    baseURL,
    apiKey,
    fetch: sanitizingFetch,
  });
}

export type ResolvedGateway = {
  source: "mcp" | "api_key";
  provider: ProviderId;
  modelName: string;
  // The vercel AI SDK model handle to pass into generateText / streamText.
  model: any;
};

export function resolveBuiltInGateway(opts: {
  kind: ModelKind;
  thinking?: boolean;
}): ResolvedGateway {
  const neokensKey = process.env.NEOKENS_API_KEY || process.env.NEOKENS_KEY;
  if (neokensKey) {
    const modelName = NEOKENS_MODEL_BY_KIND[opts.kind] ?? SITE_PROVIDER_DEFAULT_MODEL.neokens;
    const gw = createProvider("neokens", neokensKey);
    return { source: "mcp", provider: "neokens", modelName, model: gw(modelName) };
  }

  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey)
    throw new Error("AI gateway not configured — NEOKENS_API_KEY or GROQ_API_KEY missing.");
  const gw = createGroqProvider(groqKey);
  const modelName =
    opts.kind === "large"
      ? BLOXSMITH_LARGE_MODEL
      : opts.kind === "fast"
        ? BLOXSMITH_FAST_MODEL
        : opts.thinking
          ? BLOXSMITH_THINK_MODEL
          : BLOXSMITH_MODEL;
  return { source: "mcp", provider: "groq", modelName, model: gw(modelName) };
}

/**
 * Resolves which AI gateway + model to use for a given user + project.
 *
 * - If the project has `mode = 'api_key'` and the user has a stored key for
 *   the chosen provider, use that.
 * - Otherwise fall back to the built-in Groq path (current default).
 *
 * The fallback is deliberate: if a user toggles to API-key mode but hasn't
 * pasted a key yet, we don't want their next chat to hard-fail.
 */
export async function resolveAiGateway(opts: {
  userId: string;
  projectId: string | null | undefined;
  kind: ModelKind;
  thinking?: boolean;
}): Promise<ResolvedGateway> {
  const fallback = (): ResolvedGateway => resolveBuiltInGateway(opts);

  if (!opts.projectId) return fallback();

  const { data: settings } = await supabaseAdmin
    .from("project_ai_settings")
    .select("mode,provider,model")
    .eq("project_id", opts.projectId)
    .maybeSingle();

  if (!settings || settings.mode !== "api_key" || !settings.provider) {
    return fallback();
  }

  const provider = settings.provider as ProviderId;
  const rawModel = settings.model || PROVIDER_DEFAULT_MODEL[provider];

  // Neokens & Groq are site-wide gateways — use env keys, no per-user key.
  if (provider === "neokens") {
    const neoKey = process.env.NEOKENS_API_KEY || process.env.NEOKENS_KEY;
    if (!neoKey) return fallback();
    // Map the UI model id to the real Neokens id (+ thinking flag). This is the
    // single place that decides what model string Neokens actually receives.
    const { resolveNeokensModel } = await import("./ai-models");
    const { model: modelName, thinking: implicitThinking } = resolveNeokensModel(rawModel);
    if (implicitThinking) opts.thinking = true;
    const gw = createProvider("neokens", neoKey);
    return { source: "api_key", provider, modelName, model: gw(modelName) };
  }

  // Map virtual aliases (e.g. "claude-sonnet-4-6-thinking") to the real
  // model ID + implicit flags. The thinking flag is OR-ed onto whatever
  // the caller passed in opts, so an explicit Thinking toggle still works.
  const aliased = resolveModelAlias(rawModel);
  const modelName = aliased.realModel;
  if (aliased.thinking) opts.thinking = true;

  if (provider === "groq") {
    const groqKey = process.env.GROQ_API_KEY;
    if (!groqKey) return fallback();
    const gw = createGroqProvider(groqKey);
    return { source: "api_key", provider, modelName, model: gw(modelName) };
  }

  const { data: keyRow } = await supabaseAdmin
    .from("user_provider_keys")
    .select("api_key")
    .eq("user_id", opts.userId)
    .eq("provider", provider)
    .maybeSingle();

  if (!keyRow?.api_key) {
    // User toggled to API-key mode but never pasted a key — fall back gracefully.
    return fallback();
  }

  const gw = createProvider(provider, keyRow.api_key);

  return {
    source: "api_key",
    provider,
    modelName,
    model: gw(modelName),
  };
}
