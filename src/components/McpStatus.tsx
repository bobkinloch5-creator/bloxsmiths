import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Server, Loader2, CheckCircle2, XCircle, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { retestAllMcpServers } from "@/lib/mcp-test.functions";
import { toast } from "sonner";

type Row = {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  last_test_ok: boolean | null;
  last_test_error: string | null;
  tool_count: number | null;
  tools_cache: Array<{ name: string; description?: string }> | null;
  last_tested_at: string | null;
};

export function McpStatus({ compact = false }: { compact?: boolean }) {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [rechecking, setRechecking] = useState(false);
  const retestAll = useServerFn(retestAllMcpServers);

  const handleRecheckAll = async () => {
    if (rechecking) return;
    setRechecking(true);
    try {
      const r = await retestAll();
      if (r.tested === 0) {
        toast.info("No enabled MCP servers to test.");
      } else {
        toast.success(
          `Rechecked ${r.tested} server${r.tested === 1 ? "" : "s"} — ${r.ok} ok, ${r.failed} failed · avg ${r.avgLatencyMs}ms`,
        );
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Recheck failed");
    } finally {
      setRechecking(false);
    }
  };

  useEffect(() => {
    if (!user) {
      setRows([]);
      return;
    }
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase
        .from("user_mcp_servers")
        .select(
          "id,name,url,enabled,last_test_ok,last_test_error,tool_count,tools_cache,last_tested_at",
        )
        .order("created_at", { ascending: false });
      if (!cancelled) setRows((data as Row[]) ?? []);
    };
    load();

    const channel = supabase
      .channel("mcp-status-" + user.id)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_mcp_servers",
          filter: `user_id=eq.${user.id}`,
        },
        () => load(),
      )
      .subscribe();
    const t = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(t);
      supabase.removeChannel(channel);
    };
  }, [user]);

  if (!user) return null;

  const loading = rows === null;
  const enabled = (rows ?? []).filter((r) => r.enabled);
  const connected = enabled.filter((r) => r.last_test_ok === true);
  const failed = enabled.filter((r) => r.last_test_ok === false);
  const totalTools = connected.reduce((n, r) => n + (r.tool_count ?? 0), 0);

  const state: "loading" | "none" | "ok" | "partial" | "fail" = loading
    ? "loading"
    : enabled.length === 0
      ? "none"
      : failed.length > 0 && connected.length === 0
        ? "fail"
        : failed.length > 0
          ? "partial"
          : "ok";

  const color =
    state === "ok"
      ? "text-success"
      : state === "partial"
        ? "text-[oklch(0.78_0.15_85)]"
        : state === "fail"
          ? "text-destructive"
          : "text-muted-foreground";
  const dot =
    state === "ok"
      ? "bg-success shadow-[0_0_8px_oklch(0.78_0.18_150/0.7)]"
      : state === "partial"
        ? "bg-[oklch(0.78_0.15_85)]"
        : state === "fail"
          ? "bg-destructive"
          : "bg-muted-foreground/60";

  const label =
    state === "loading"
      ? "Checking…"
      : state === "none"
        ? "No MCP"
        : state === "fail"
          ? `MCP error`
          : `${connected.length} MCP · ${totalTools} tool${totalTools === 1 ? "" : "s"}`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="MCP server connections"
          className={`inline-flex items-center gap-1.5 rounded-full border border-border bg-surface/60 backdrop-blur px-2.5 py-1 text-xs ${color} hover:bg-surface transition`}
        >
          <span className="relative inline-flex h-2 w-2">
            {state === "ok" && (
              <span className="absolute inset-0 rounded-full bg-success/60 animate-ping" />
            )}
            <span className={`relative inline-block h-2 w-2 rounded-full ${dot}`} />
          </span>
          {state === "loading" ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Server className="h-3 w-3" />
          )}
          {!compact && <span className="font-medium">{label}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="p-3 border-b border-border flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-sm font-semibold">MCP connections</div>
            <div className="text-xs text-muted-foreground truncate">
              {enabled.length} enabled · {totalTools} tool{totalTools === 1 ? "" : "s"} ready
            </div>
          </div>
          <div className="inline-flex items-center gap-2 shrink-0">
            {enabled.length > 0 && (
              <button
                onClick={handleRecheckAll}
                disabled={rechecking}
                title="Re-test every enabled MCP server"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition disabled:opacity-50"
              >
                {rechecking ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <RefreshCw className="h-3 w-3" />
                )}
                Recheck
              </button>
            )}
            <Link to="/mcp-servers" className="text-xs text-primary hover:underline">
              Manage
            </Link>
          </div>
        </div>
        <div className="max-h-72 overflow-y-auto">
          {(rows ?? []).length === 0 ? (
            <div className="p-4 text-xs text-muted-foreground">
              No MCP servers yet.{" "}
              <Link to="/mcp-servers" className="text-primary hover:underline">
                Connect one
              </Link>
              .
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {(rows ?? []).map((r) => {
                const ok = r.enabled && r.last_test_ok === true;
                const bad = r.enabled && r.last_test_ok === false;
                return (
                  <li key={r.id} className="p-3 text-xs">
                    <div className="flex items-center gap-2">
                      <span
                        className={`h-2 w-2 rounded-full shrink-0 ${
                          !r.enabled
                            ? "bg-muted-foreground/40"
                            : ok
                              ? "bg-success"
                              : bad
                                ? "bg-destructive"
                                : "bg-muted-foreground/60"
                        }`}
                      />
                      <span className="font-medium text-foreground truncate flex-1">{r.name}</span>
                      {ok && (
                        <span className="inline-flex items-center gap-1 text-success">
                          <CheckCircle2 className="h-3 w-3" />
                          {r.tool_count ?? 0}
                        </span>
                      )}
                      {bad && (
                        <span className="inline-flex items-center gap-1 text-destructive">
                          <XCircle className="h-3 w-3" /> error
                        </span>
                      )}
                      {!r.enabled && <span className="text-muted-foreground">off</span>}
                    </div>
                    <div className="text-muted-foreground truncate mt-0.5 pl-4">{r.url}</div>
                    {ok && r.tools_cache && r.tools_cache.length > 0 && (
                      <div className="text-muted-foreground mt-1 pl-4 break-words">
                        <span className="text-foreground/80">Tools:</span>{" "}
                        {r.tools_cache.map((t) => t.name).join(", ")}
                      </div>
                    )}
                    {bad && r.last_test_error && (
                      <div className="text-destructive mt-1 pl-4 break-words">
                        {r.last_test_error}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
