export type SiteProviderId = "neokens";

export const SITE_PROVIDER_LABELS: Record<SiteProviderId, string> = {
  neokens: "Neokens (free)",
};

export const SITE_PROVIDER_MODELS: Record<SiteProviderId, string[]> = {
  neokens: [
    "claude-opus-4-7-thinking",
    "claude-sonnet-4-6-thinking",
    "gpt-5.5",
    "gpt-5.3-codex",
    "gpt-5.4",
    "gemini-3-flash",
    "claude-haiku-4-5-20251001",
  ],
};

export const SITE_PROVIDER_DEFAULT_MODEL: Record<SiteProviderId, string> = {
  neokens: "gpt-5.5",
};

export const SITE_MODEL_DESCRIPTIONS: Record<string, string> = {
  "claude-opus-4-7-thinking":
    "Highest-depth Claude reasoning with adaptive thinking. Best for very large Roblox systems, deep debugging, architecture decisions, and hard multi-file builds.",
  "claude-sonnet-4-6-thinking":
    "Frontier reasoning with adaptive thinking. Best for full-game architecture, complex anti-exploit, and hard debugging where it should slow down and think first.",
  "gpt-5.5":
    "OpenAI's newest flagship — strongest at agentic coding, multi-step Roblox builds, and complex Luau refactors. Use for full games and ambitious systems.",
  "gpt-5.3-codex":
    "Code specialist. Best for long Luau files, OOP classes, CFrame math, and raycast logic.",
  "gpt-5.4":
    "Strong reasoning for combat formulas, anti-exploit checks, ProfileService logic, and complex math.",
  "gemini-3-flash":
    "Fast all-rounder for everyday Roblox scripting: GUIs, RemoteEvents, and small gameplay edits. Cheap and quick.",
  "claude-haiku-4-5-20251001":
    "Cheap and careful for cleaning messy Luau, refactoring scripts, and writing tidy ModuleScripts.",
};

// ─────────────────────────────────────────────────────────────────────────
// Neokens model mapping.
//
// The UI model id (the key) is what the picker shows and stores. The value is
// the EXACT model id Neokens accepts at api.quatarly.cloud, plus whether this
// UI id implies "thinking" mode.
//
// ⚠️ EDIT THIS to match your Neokens dashboard. If a UI id already equals the
// real Neokens id, you can omit it (unmapped ids pass through unchanged). The
// only entries that MUST be here are aliases whose UI name differs from the
// real id — especially the "-thinking" variant, which must map to a base model
// id plus thinking:true (Neokens does not accept "...-thinking" as a literal
// model name).
//
// Format:  "ui-id": { neokens: "real-neokens-id", thinking?: true }
// ─────────────────────────────────────────────────────────────────────────
export const NEOKENS_MODEL_MAP: Record<string, { neokens: string; thinking?: boolean }> = {
  "claude-opus-4-7-thinking": { neokens: "claude-opus-4-7", thinking: true },

  // The thinking variant must resolve to a real base model id + the flag.
  // Replace "claude-sonnet-4-6" with whatever your Neokens dashboard lists as
  // the Sonnet model id if it differs.
  "claude-sonnet-4-6-thinking": { neokens: "claude-sonnet-4-6", thinking: true },

  // The rest pass through by default. If your dashboard uses different ids,
  // map them here, for example:
  // "gpt-5.5": { neokens: "gpt-5.5" },
};

// A Neokens model id that is known to work, used as a last-resort fallback when
// a selected model errors at the gateway. It should DIFFER from the default build
// model (gemini-3-flash) so that if that model is the one 502-ing, the fallback
// actually tries something else. gpt-5.5 is the catalog default and a reliable
// alternative. Override with NEOKENS_SAFE_FALLBACK_MODEL if your dashboard differs.
export const NEOKENS_SAFE_FALLBACK_MODEL =
  (typeof process !== "undefined" && process.env?.NEOKENS_SAFE_FALLBACK_MODEL) || "gpt-5.5";

/**
 * Resolve a UI model id to the real Neokens model id + thinking flag.
 * Unmapped ids pass through unchanged (thinking inferred from a "-thinking"
 * suffix as a safety net).
 */
export function resolveNeokensModel(uiModelId: string): { model: string; thinking: boolean } {
  const mapped = NEOKENS_MODEL_MAP[uiModelId];
  if (mapped) return { model: mapped.neokens, thinking: !!mapped.thinking };
  // Safety net: if a "-thinking" id wasn't explicitly mapped, strip the suffix
  // and turn on thinking rather than sending an invalid "...-thinking" string.
  if (uiModelId.endsWith("-thinking")) {
    return { model: uiModelId.slice(0, -"-thinking".length), thinking: true };
  }
  return { model: uiModelId, thinking: false };
}
