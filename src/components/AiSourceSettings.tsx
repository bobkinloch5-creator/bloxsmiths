import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  Loader2,
  Key,
  Server,
  Check,
  X,
  Eye,
  EyeOff,
  Plug,
  ExternalLink,
  AlertCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  getProjectAiConfig,
  saveProjectAiSettings,
  saveProviderKey,
  clearProviderKey,
} from "@/lib/project-ai.functions";
import { SITE_PROVIDER_LABELS, SITE_PROVIDER_MODELS, type SiteProviderId } from "@/lib/ai-models";

type SiteOnlyProviderId = SiteProviderId;
type ProviderId = SiteOnlyProviderId;
type Mode = "mcp" | "api_key";
const isSiteProvider = (value: unknown): value is SiteOnlyProviderId => value === "neokens";

type McpRow = {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  last_test_ok: boolean | null;
  tool_count: number | null;
};

const PROVIDER_LABELS: Record<ProviderId, string> = {
  neokens: SITE_PROVIDER_LABELS.neokens,
};

const PROVIDER_MODELS: Record<ProviderId, string[]> = {
  neokens: [...SITE_PROVIDER_MODELS.neokens],
};

const SITE_ONLY_PROVIDERS: SiteOnlyProviderId[] = ["neokens"];

const PROVIDER_KEY_HINTS: Record<ProviderId, string> = {
  neokens: "Site-wide key managed by admin (NEOKENS_API_KEY)",
};

export function AiSourceSettings({
  projectId,
  onClose,
}: {
  projectId: string;
  onClose: () => void;
}) {
  const get = useServerFn(getProjectAiConfig);
  const saveSettings = useServerFn(saveProjectAiSettings);
  const saveKey = useServerFn(saveProviderKey);
  const clearKey = useServerFn(clearProviderKey);

  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>("mcp");
  const [provider, setProvider] = useState<SiteOnlyProviderId>("neokens");
  const [model, setModel] = useState<string>(PROVIDER_MODELS.neokens[0]);
  const [keys, setKeys] = useState<Record<string, { label: string | null; updatedAt: string }>>({});
  const [draftKey, setDraftKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [mcpServers, setMcpServers] = useState<McpRow[]>([]);
  const [mcpLoading, setMcpLoading] = useState(true);
  const [mcpBusy, setMcpBusy] = useState<string | null>(null);

  const loadMcp = async () => {
    setMcpLoading(true);
    const { data } = await supabase
      .from("user_mcp_servers")
      .select("id,name,url,enabled,last_test_ok,tool_count")
      .order("created_at", { ascending: false });
    setMcpServers((data as McpRow[]) ?? []);
    setMcpLoading(false);
  };

  const toggleMcp = async (s: McpRow) => {
    setMcpBusy(s.id);
    const { error } = await supabase
      .from("user_mcp_servers")
      .update({ enabled: !s.enabled })
      .eq("id", s.id);
    setMcpBusy(null);
    if (error) return flash("err", error.message);
    setMcpServers((prev) => prev.map((x) => (x.id === s.id ? { ...x, enabled: !x.enabled } : x)));
  };

  const load = async () => {
    setLoading(true);
    try {
      const res = await get({ data: { projectId } });
      const s = res.settings;
      setMode((s.mode as Mode) ?? "mcp");
      const nextProvider = isSiteProvider(s.provider) ? s.provider : "neokens";
      setProvider(nextProvider);
      setModel(s.model ?? PROVIDER_MODELS[nextProvider][0]);
      setKeys(res.keys ?? {});
    } catch (e) {
      setToast({ kind: "err", text: e instanceof Error ? e.message : "Failed to load" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    loadMcp();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const flash = (kind: "ok" | "err", text: string) => {
    setToast({ kind, text });
    setTimeout(() => setToast(null), 2400);
  };

  const handleSaveMode = async (next: Mode, nextProvider?: ProviderId, nextModel?: string) => {
    setBusy("mode");
    try {
      await saveSettings({
        data: {
          projectId,
          mode: next,
          provider: next === "api_key" ? (nextProvider ?? provider) : null,
          model: next === "api_key" ? (nextModel ?? model) : null,
        },
      });
      flash("ok", next === "api_key" ? "Switched to API key" : "Switched to MCP");
    } catch (e) {
      flash("err", e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(null);
    }
  };

  const handleSaveKey = async () => {
    if (!draftKey.trim()) return;
    setBusy("key");
    try {
      await saveKey({ data: { provider, apiKey: draftKey.trim() } });
      setDraftKey("");
      await load();
      flash("ok", `${PROVIDER_LABELS[provider]} key saved`);
    } catch (e) {
      flash("err", e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(null);
    }
  };

  const handleClearKey = async (p: ProviderId) => {
    if (!confirm(`Remove your ${PROVIDER_LABELS[p]} API key?`)) return;
    setBusy(`clear-${p}`);
    try {
      await clearKey({ data: { provider: p } });
      await load();
      flash("ok", `${PROVIDER_LABELS[p]} key removed`);
    } catch (e) {
      flash("err", e instanceof Error ? e.message : "Remove failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-background/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl rounded-2xl border border-border bg-surface shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-border p-4">
          <div>
            <h2 className="text-sm font-semibold">AI model</h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Pick the LLM that builds your game. MCP servers add tools on top — they don't replace
              the model.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-surface-elevated"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {loading ? (
          <div className="grid place-items-center p-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <div className="space-y-5 p-4">
            <div className="rounded-md border border-border bg-surface-elevated/40 px-3 py-2 text-[11px] text-muted-foreground leading-relaxed">
              <span className="font-semibold text-foreground">About MCP:</span> any MCP server you
              add in <span className="font-mono">Settings → MCP</span> is{" "}
              <span className="text-foreground">always on</span> — its tools are merged into every
              build automatically. MCP is not an AI provider, so connecting one (e.g. Codex MCP)
              does not change which model runs. Pick the model below.
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => {
                  setMode("mcp");
                  handleSaveMode("mcp");
                }}
                disabled={busy === "mode"}
                className={`flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition ${
                  mode === "mcp"
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-border/80"
                }`}
              >
                <div className="flex items-center gap-2 text-xs font-semibold">
                  <Server className="h-3.5 w-3.5" /> Built-in
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Default BloxSmith pipeline running on Neokens. Uses your credits.
                </p>
              </button>
              <button
                onClick={() => {
                  setMode("api_key");
                  handleSaveMode("api_key", provider, model);
                }}
                disabled={busy === "mode"}
                className={`flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition ${
                  mode === "api_key"
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-border/80"
                }`}
              >
                <div className="flex items-center gap-2 text-xs font-semibold">
                  <Key className="h-3.5 w-3.5" /> Free API
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Use the site Neokens key with the Roblox model you pick. No OpenAI or Anthropic
                  keys needed.
                </p>
              </button>
            </div>

            <div className="rounded-lg border border-border bg-surface-elevated/40 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-semibold">
                  <Plug className="h-3.5 w-3.5 text-primary" /> MCP servers
                  <span className="text-[10px] font-normal text-muted-foreground">
                    (tools merged into every build)
                  </span>
                </div>
                <Link
                  to="/mcp-servers"
                  className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
                >
                  Manage <ExternalLink className="h-3 w-3" />
                </Link>
              </div>

              {mcpLoading ? (
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> Loading servers…
                </div>
              ) : mcpServers.length === 0 ? (
                <div className="rounded-md border border-dashed border-border px-3 py-3 text-center text-[11px] text-muted-foreground">
                  No MCP servers yet.{" "}
                  <Link to="/mcp-servers" className="text-primary hover:underline">
                    Add one
                  </Link>{" "}
                  to give the AI extra tools (Codex, Notion, Linear, etc.).
                </div>
              ) : (
                <ul className="space-y-1 max-h-40 overflow-y-auto pr-1">
                  {mcpServers.map((s) => (
                    <li
                      key={s.id}
                      className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-background/40 px-2.5 py-1.5"
                    >
                      <label className="flex items-center gap-2 min-w-0 cursor-pointer flex-1">
                        <input
                          type="checkbox"
                          checked={s.enabled}
                          disabled={mcpBusy === s.id}
                          onChange={() => toggleMcp(s)}
                          className="h-3.5 w-3.5 accent-primary"
                        />
                        <span className="truncate text-xs font-medium">{s.name}</span>
                        {s.last_test_ok === true ? (
                          <span className="inline-flex items-center gap-0.5 text-[10px] text-success shrink-0">
                            <Check className="h-3 w-3" />
                            {s.tool_count ?? 0} tools
                          </span>
                        ) : s.last_test_ok === false ? (
                          <span className="inline-flex items-center gap-0.5 text-[10px] text-destructive shrink-0">
                            <AlertCircle className="h-3 w-3" /> failing
                          </span>
                        ) : null}
                      </label>
                      <span className="truncate text-[10px] text-muted-foreground max-w-[40%]">
                        {s.url.replace(/^https?:\/\//, "")}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {mode === "api_key" && (
              <div className="space-y-3 rounded-lg border border-border bg-surface-elevated/40 p-3">
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Provider
                    </span>
                    <select
                      value={provider}
                      onChange={(e) => {
                        const p = e.target.value as SiteOnlyProviderId;
                        const m = PROVIDER_MODELS[p][0];
                        setProvider(p);
                        setModel(m);
                        handleSaveMode("api_key", p, m);
                      }}
                      className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
                    >
                      {SITE_ONLY_PROVIDERS.map((p) => (
                        <option key={p} value={p}>
                          {PROVIDER_LABELS[p]}
                          {keys[p] ? " ✓" : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Model
                    </span>
                    <select
                      value={model}
                      onChange={(e) => {
                        setModel(e.target.value);
                        handleSaveMode("api_key", provider, e.target.value);
                      }}
                      className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
                    >
                      {PROVIDER_MODELS[provider].map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                {provider === "neokens" ? (
                  <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-[11px] text-foreground">
                    <span className="font-semibold">{PROVIDER_LABELS[provider]}</span> uses a shared
                    site key (<span className="font-mono">NEOKENS_API_KEY</span>) — no per-user key
                    needed. One balance covers GPT, Claude, and Gemini models.
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        {PROVIDER_LABELS[provider]} API key
                      </span>
                      {keys[provider] ? (
                        <button
                          onClick={() => handleClearKey(provider)}
                          disabled={busy === `clear-${provider}`}
                          className="text-[10px] text-muted-foreground hover:text-foreground"
                        >
                          Remove saved key
                        </button>
                      ) : null}
                    </div>
                    {keys[provider] ? (
                      <div className="mt-1 flex items-center gap-2 rounded-md border border-success/40 bg-success/5 px-2.5 py-1.5 text-[11px] text-success">
                        <Check className="h-3.5 w-3.5" />
                        Key on file — saved{" "}
                        {new Date(keys[provider].updatedAt).toLocaleDateString()}
                      </div>
                    ) : (
                      <div className="mt-1 flex gap-2">
                        <div className="relative flex-1">
                          <input
                            type={showKey ? "text" : "password"}
                            value={draftKey}
                            onChange={(e) => setDraftKey(e.target.value)}
                            placeholder={PROVIDER_KEY_HINTS[provider]}
                            className="w-full rounded-md border border-border bg-background px-2 py-1.5 pr-8 text-xs font-mono"
                          />
                          <button
                            type="button"
                            onClick={() => setShowKey((v) => !v)}
                            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                          >
                            {showKey ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                          </button>
                        </div>
                        <button
                          onClick={handleSaveKey}
                          disabled={busy === "key" || !draftKey.trim()}
                          className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-40"
                        >
                          {busy === "key" ? "Saving…" : "Save key"}
                        </button>
                      </div>
                    )}
                    <p className="mt-1.5 text-[10px] text-muted-foreground">
                      Stored encrypted in your account. Only used by your projects.
                    </p>
                  </div>
                )}
              </div>
            )}

            {toast && (
              <div
                className={`rounded-md px-3 py-2 text-[11px] ${
                  toast.kind === "ok"
                    ? "bg-success/10 text-success"
                    : "bg-destructive/10 text-destructive"
                }`}
              >
                {toast.text}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
