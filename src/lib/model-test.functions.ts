import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { SITE_PROVIDER_MODELS, type SiteProviderId } from "./ai-models";

export type ModelTestResult = {
  provider: SiteProviderId;
  modelId: string;
  realModel: string;
  ok: boolean;
  durationMs: number;
  sample?: string;
  errorKind?:
    | "not_configured"
    | "model_not_found"
    | "auth"
    | "rate_limit"
    | "timeout"
    | "provider"
    | "unknown";
  errorMessage?: string;
};

const PER_MODEL_TIMEOUT_MS = 90_000;
const PING_PROMPT = "Say hi in one short sentence.";

function classifyError(err: any): { kind: ModelTestResult["errorKind"]; message: string } {
  const message = String(err?.message ?? err ?? "unknown error");
  const lower = message.toLowerCase();
  const status = err?.status ?? err?.statusCode;

  if (err?.name === "AbortError" || /abort|timeout|timed out/i.test(message)) {
    return { kind: "timeout", message };
  }
  if (
    status === 404 ||
    /not found|does not exist|unknown model|invalid model|no such model/i.test(lower)
  ) {
    return { kind: "model_not_found", message };
  }
  if (
    status === 401 ||
    status === 403 ||
    /unauthorized|forbidden|invalid.*api.*key|authentication/i.test(lower)
  ) {
    return { kind: "auth", message };
  }
  if (status === 429 || /rate.?limit|too many requests/i.test(lower)) {
    return { kind: "rate_limit", message };
  }
  if (
    status === 502 ||
    status === 503 ||
    status === 504 ||
    /bad gateway|service unavailable|provider/i.test(lower)
  ) {
    return { kind: "provider", message };
  }
  return { kind: "unknown", message };
}

async function testOneModel(provider: SiteProviderId, modelId: string): Promise<ModelTestResult> {
  const started = Date.now();
  const { generateText } = await import("ai");
  const { createProvider, resolveModelAlias } = await import("./ai-providers.server");
  const { createGroqProvider } = await import("./ai-gateway.server");
  const aliased = resolveModelAlias(modelId);

  let model: any;
  try {
    if (provider === "neokens") {
      const key = process.env.NEOKENS_API_KEY || process.env.NEOKENS_KEY;
      if (!key) {
        return {
          provider,
          modelId,
          realModel: aliased.realModel,
          ok: false,
          durationMs: 0,
          errorKind: "not_configured",
          errorMessage: "NEOKENS_API_KEY env var not set on the server.",
        };
      }
      const gw = createProvider("neokens", key);
      model = gw(aliased.realModel);
    } else if (provider === "groq") {
      const key = process.env.GROQ_API_KEY;
      if (!key) {
        return {
          provider,
          modelId,
          realModel: aliased.realModel,
          ok: false,
          durationMs: 0,
          errorKind: "not_configured",
          errorMessage: "GROQ_API_KEY env var not set on the server.",
        };
      }
      const gw = createGroqProvider(key);
      model = gw(aliased.realModel);
    } else {
      return {
        provider,
        modelId,
        realModel: aliased.realModel,
        ok: false,
        durationMs: 0,
        errorKind: "unknown",
        errorMessage: `Unsupported provider for site test: ${provider}`,
      };
    }
  } catch (err) {
    const { kind, message } = classifyError(err);
    return {
      provider,
      modelId,
      realModel: aliased.realModel,
      ok: false,
      durationMs: Date.now() - started,
      errorKind: kind,
      errorMessage: message,
    };
  }

  try {
    const out = await generateText({
      model,
      prompt: PING_PROMPT,
      maxOutputTokens: 500,
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(PER_MODEL_TIMEOUT_MS),
    });
    const sample = (out.text ?? "").trim().slice(0, 200);
    if (!sample) {
      return {
        provider,
        modelId,
        realModel: aliased.realModel,
        ok: false,
        durationMs: Date.now() - started,
        errorKind: "unknown",
        errorMessage: "Model returned no visible text. Likely a request-shape issue.",
      };
    }
    return {
      provider,
      modelId,
      realModel: aliased.realModel,
      ok: true,
      durationMs: Date.now() - started,
      sample,
    };
  } catch (err) {
    const { kind, message } = classifyError(err);
    return {
      provider,
      modelId,
      realModel: aliased.realModel,
      ok: false,
      durationMs: Date.now() - started,
      errorKind: kind,
      errorMessage: message.slice(0, 500),
    };
  }
}

export const testAllSiteModels = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = context.supabase as any;
    const { userId } = context;
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    const isAdmin = (roles ?? []).some(
      (r: any) => r.role === "admin" || r.role === "owner",
    );
    if (!isAdmin) {
      throw new Error("Forbidden — admin only.");
    }

    const jobs: Promise<ModelTestResult>[] = [];
    for (const provider of Object.keys(SITE_PROVIDER_MODELS) as SiteProviderId[]) {
      for (const modelId of SITE_PROVIDER_MODELS[provider]) {
        jobs.push(testOneModel(provider, modelId));
      }
    }
    const results = await Promise.all(jobs);
    const okCount = results.filter((r) => r.ok).length;
    return {
      ranAt: new Date().toISOString(),
      totalModels: results.length,
      okCount,
      failCount: results.length - okCount,
      results,
    };
  });
