import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Trash2, Plus, Plug, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { testMcpServer } from "@/lib/mcp-test.functions";

type Server = {
  id: string;
  name: string;
  url: string;
  auth_header: string | null;
  enabled: boolean;
  last_tested_at: string | null;
  last_test_ok: boolean | null;
  last_test_error: string | null;
  tool_count: number | null;
  tools_cache: Array<{ name: string; description: string }> | null;
};

export const Route = createFileRoute("/mcp-servers")({
  component: McpServersPage,
  head: () => ({
    meta: [
      { title: "Your MCP Servers — BloxSmith" },
      {
        name: "description",
        content:
          "Connect any MCP server (Notion, Linear, GitHub, custom) so the BloxSmith AI can use its tools when building your Roblox games.",
      },
      { property: "og:title", content: "Your MCP Servers — BloxSmith" },
      {
        property: "og:description",
        content: "Hook up Notion, Linear, GitHub or any custom MCP server to the BloxSmith AI.",
      },
      { property: "og:url", content: "https://bloxsmith.pro/mcp-servers" },
    ],
    links: [{ rel: "canonical", href: "https://bloxsmith.pro/mcp-servers" }],
  }),
});

type TestState = {
  status: "idle" | "loading" | "ok" | "fail";
  toolCount?: number;
  error?: string;
  tools?: Array<{ name: string; description: string }>;
};

function McpServersPage() {
  const [servers, setServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: "", url: "", auth_header: "" });
  const [saving, setSaving] = useState(false);
  const [tests, setTests] = useState<Record<string, TestState>>({});
  const runTest = useServerFn(testMcpServer);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("user_mcp_servers")
      .select(
        "id,name,url,auth_header,enabled,last_tested_at,last_test_ok,last_test_error,tool_count,tools_cache",
      )
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    const rows = (data as Server[]) ?? [];
    setServers(rows);
    // Hydrate test state from cached DB values so users see what's saved instantly.
    setTests((prev) => {
      const next = { ...prev };
      for (const s of rows) {
        if (next[s.id]) continue;
        if (s.last_test_ok === true) {
          next[s.id] = { status: "ok", toolCount: s.tool_count ?? 0, tools: s.tools_cache ?? [] };
        } else if (s.last_test_ok === false) {
          next[s.id] = { status: "fail", error: s.last_test_error ?? "Test failed" };
        }
      }
      return next;
    });
    setLoading(false);
  };

  const testServer = async (s: Server, silent = false) => {
    setTests((t) => ({ ...t, [s.id]: { status: "loading" } }));
    try {
      const res = await runTest({ data: { serverId: s.id } });
      if (res.ok) {
        setTests((t) => ({
          ...t,
          [s.id]: { status: "ok", toolCount: res.toolCount, tools: res.tools },
        }));
        if (!silent)
          toast.success(`${s.name}: ${res.toolCount} tool${res.toolCount === 1 ? "" : "s"} ready`);
      } else {
        setTests((t) => ({ ...t, [s.id]: { status: "fail", error: res.error } }));
        if (!silent) toast.error(`${s.name}: ${res.error}`);
      }
    } catch (e: any) {
      setTests((t) => ({ ...t, [s.id]: { status: "fail", error: e?.message ?? "Test failed" } }));
      if (!silent) toast.error(e?.message ?? "Test failed");
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    // Only re-test servers whose cache is stale (older than 1 hour) or never tested.
    const STALE_MS = 60 * 60 * 1000;
    const now = Date.now();
    servers.forEach((s) => {
      if (!s.enabled) return;
      const cachedAt = s.last_tested_at ? new Date(s.last_tested_at).getTime() : 0;
      if (now - cachedAt > STALE_MS) testServer(s, true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [servers]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.url.trim()) return;
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u?.user) {
      toast.error("Please sign in.");
      setSaving(false);
      return;
    }
    const { error } = await supabase.from("user_mcp_servers").insert({
      user_id: u.user.id,
      name: form.name.trim(),
      url: form.url.trim(),
      auth_header: form.auth_header.trim() || null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("MCP server added");
    setForm({ name: "", url: "", auth_header: "" });
    load();
  };

  const toggle = async (s: Server) => {
    const { error } = await supabase
      .from("user_mcp_servers")
      .update({ enabled: !s.enabled })
      .eq("id", s.id);
    if (error) return toast.error(error.message);
    load();
  };

  const remove = async (s: Server) => {
    if (!confirm(`Remove ${s.name}?`)) return;
    const { error } = await supabase.from("user_mcp_servers").delete().eq("id", s.id);
    if (error) return toast.error(error.message);
    toast.success("Removed");
    load();
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-6 py-12 space-y-8">
        <header className="space-y-2">
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
            ← Back
          </Link>
          <h1 className="text-3xl font-bold">Your MCP servers</h1>
          <p className="text-muted-foreground">
            Connect any Model Context Protocol server (Notion, Linear, GitHub, your own custom
            server…). The BloxSmith AI will auto-discover their tools and call them while building
            your Roblox games.
          </p>
        </header>

        <div className="border border-primary/30 bg-primary/5 rounded-lg p-4 text-sm space-y-2">
          <div className="font-semibold flex items-center gap-2">
            ✨ Let the AI configure this for you
          </div>
          <p className="text-muted-foreground">
            You don&apos;t have to fill out the form below. Open any project chat and just paste
            your server URL or token — for example:
          </p>
          <ul className="list-disc pl-5 text-muted-foreground space-y-1">
            <li>
              <span className="text-foreground">&ldquo;Add this MCP token: bsmcp_…&rdquo;</span> →
              adds BloxSmith&apos;s own MCP server automatically.
            </li>
            <li>
              <span className="text-foreground">
                &ldquo;Add Notion MCP at https://… with Bearer sk-…&rdquo;
              </span>{" "}
              → adds any third-party server.
            </li>
            <li>
              <span className="text-foreground">
                &ldquo;Update my BloxSmith token to bsmcp_…&rdquo;
              </span>{" "}
              → rotates the key on an existing server.
            </li>
          </ul>
          <p className="text-muted-foreground">
            Works in Cursor, Claude, Codex, Windsurf, and any other IDE / chat that speaks MCP.
          </p>
        </div>

        <form onSubmit={add} className="space-y-4 border border-border rounded-lg p-6 bg-card">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Plus className="h-4 w-4" /> Add a server
          </h2>
          <div className="grid gap-3">
            <div>
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                placeholder="notion"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="url">Streamable HTTP URL</Label>
              <Input
                id="url"
                placeholder="https://mcp.notion.com/mcp"
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="auth">Authorization header (optional)</Label>
              <Input
                id="auth"
                placeholder="Bearer sk_xxx"
                value={form.auth_header}
                onChange={(e) => setForm({ ...form, auth_header: e.target.value })}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Sent verbatim as the <code>Authorization</code> header. Leave blank for public
                servers.
              </p>
            </div>
          </div>
          <Button type="submit" disabled={saving}>
            {saving ? "Adding…" : "Add server"}
          </Button>
        </form>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Connected servers</h2>
          {loading ? (
            <p className="text-muted-foreground text-sm">Loading…</p>
          ) : servers.length === 0 ? (
            <p className="text-muted-foreground text-sm">None yet.</p>
          ) : (
            <ul className="space-y-2">
              {servers.map((s) => {
                const t = tests[s.id];
                return (
                  <li
                    key={s.id}
                    className="border border-border rounded-lg p-4 bg-card flex flex-col gap-3"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0 flex-1 flex items-start gap-3">
                        {(() => {
                          const dotClass = !s.enabled
                            ? "bg-muted-foreground/40"
                            : t?.status === "loading"
                              ? "bg-amber-500 animate-pulse"
                              : t?.status === "ok"
                                ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]"
                                : t?.status === "fail"
                                  ? "bg-destructive"
                                  : "bg-muted-foreground/40";
                          const label = !s.enabled
                            ? "Disabled"
                            : t?.status === "loading"
                              ? "Testing connection…"
                              : t?.status === "ok"
                                ? "Connected"
                                : t?.status === "fail"
                                  ? "Connection failed"
                                  : "Not tested";
                          return (
                            <span
                              className={`mt-1.5 h-2.5 w-2.5 rounded-full shrink-0 ${dotClass}`}
                              title={label}
                              aria-label={label}
                            />
                          );
                        })()}
                        <div className="min-w-0 flex-1">
                          <div className="font-medium flex items-center gap-2 flex-wrap">
                            {s.name}
                            <span
                              className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border ${
                                !s.enabled
                                  ? "border-border text-muted-foreground"
                                  : t?.status === "loading"
                                    ? "border-amber-500/40 text-amber-500"
                                    : t?.status === "ok"
                                      ? "border-emerald-500/40 text-emerald-500"
                                      : t?.status === "fail"
                                        ? "border-destructive/40 text-destructive"
                                        : "border-border text-muted-foreground"
                              }`}
                            >
                              {!s.enabled
                                ? "off"
                                : t?.status === "loading"
                                  ? "testing"
                                  : t?.status === "ok"
                                    ? "live"
                                    : t?.status === "fail"
                                      ? "error"
                                      : "idle"}
                            </span>
                            {t?.status === "loading" && (
                              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                            )}
                            {t?.status === "ok" && (
                              <span className="inline-flex items-center gap-1 text-xs font-normal text-emerald-500">
                                <CheckCircle2 className="h-3.5 w-3.5" /> {t.toolCount} tool
                                {t.toolCount === 1 ? "" : "s"}
                              </span>
                            )}
                            {t?.status === "fail" && (
                              <span className="inline-flex items-center gap-1 text-xs font-normal text-destructive">
                                <XCircle className="h-3.5 w-3.5" /> error
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">{s.url}</div>
                          <div className="text-xs text-muted-foreground">
                            {s.auth_header && <span className="mr-2">🔐 auth set</span>}
                            {s.last_tested_at && (
                              <span>
                                Last checked {new Date(s.last_tested_at).toLocaleString()}
                              </span>
                            )}
                          </div>
                          {t?.status === "fail" && t.error && (
                            <div className="text-xs text-destructive mt-1 break-words">
                              {t.error}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => testServer(s)}
                          disabled={t?.status === "loading"}
                        >
                          <Plug className="h-3.5 w-3.5 mr-1" /> Test
                        </Button>
                        <Switch checked={s.enabled} onCheckedChange={() => toggle(s)} />
                        <Button variant="ghost" size="icon" onClick={() => remove(s)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    {t?.status === "ok" && t.tools && t.tools.length > 0 && (
                      <div className="text-xs text-muted-foreground border-t border-border pt-2">
                        <span className="font-medium text-foreground">Available tools: </span>
                        {t.tools.map((tool) => tool.name).join(", ")}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="text-sm text-muted-foreground space-y-2 border-t border-border pt-6">
          <p className="font-semibold text-foreground">Popular MCP servers to try:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>
              <strong>Notion</strong> — <code>https://mcp.notion.com/mcp</code>
            </li>
            <li>
              <strong>Linear</strong> — <code>https://mcp.linear.app/sse</code>
            </li>
            <li>
              <strong>GitHub</strong> — <code>https://api.githubcopilot.com/mcp/</code>
            </li>
            <li>
              <strong>Sentry</strong> — <code>https://mcp.sentry.dev/sse</code>
            </li>
            <li>Or your own self-hosted Streamable HTTP MCP server.</li>
          </ul>
        </section>
      </div>
    </main>
  );
}
