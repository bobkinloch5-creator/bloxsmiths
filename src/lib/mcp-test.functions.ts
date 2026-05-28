import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";
import {
  isOwnMcpUrl,
  mcpHttpHeaders,
  normalizeMcpAuthHeader,
  parseMcpHttpResponse,
  MCP_PROTOCOL_VERSION,
} from "./mcp-rpc-utils";

function randomToken(len = 32) {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256(text: string) {
  const buf = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function ensureOwnToken(userId: string): Promise<string> {
  const token = "bsmcp_" + randomToken(32);
  const hash = await sha256(token);
  const { error } = await supabaseAdmin
    .from("mcp_tokens")
    .upsert(
      { user_id: userId, token_hash: hash, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
  if (error) throw new Error(`Could not mint MCP token: ${error.message}`);
  return token;
}

// Shared core so both single-test and bulk-retest reuse the same logic.
// Also captures latency (ms) for advanced diagnostics.
export async function runMcpHealthCheck(
  supabase: any,
  userId: string,
  serverId: string,
): Promise<
  | {
      ok: true;
      toolCount: number;
      tools: Array<{ name: string; description: string }>;
      latencyMs: number;
    }
  | { ok: false; error: string; latencyMs: number }
> {
  const started = Date.now();
  const { data: server, error } = await supabase
    .from("user_mcp_servers")
    .select("id,name,url,auth_header")
    .eq("id", serverId)
    .maybeSingle();
  if (error || !server) {
    return { ok: false, error: "Server not found", latencyMs: Date.now() - started };
  }

  let authHeader = normalizeMcpAuthHeader(server.auth_header);

  const pointsAtUs = isOwnMcpUrl(server.url);
  if (pointsAtUs) {
    const adminSecret = process.env.MCP_SECRET;
    if (adminSecret) authHeader = `Bearer ${adminSecret}`;
    else authHeader = `Bearer ${await ensureOwnToken(userId)}`;
  }

  const rpc = async (method: string, params: any, id: number) => {
    const r = await fetch(server.url, {
      method: "POST",
      headers: mcpHttpHeaders(authHeader),
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
    });
    if (!r.ok) {
      if (r.status === 401) {
        throw new Error(
          pointsAtUs
            ? "401 from our own MCP server — token sync failed. Try again."
            : "401 Unauthorized — the Authorization header for this server is missing or invalid.",
        );
      }
      throw new Error(`HTTP ${r.status} ${r.statusText}`);
    }
    const parsed = await parseMcpHttpResponse(r);
    if (parsed.error) throw new Error(parsed.error.message);
    return parsed.result;
  };

  try {
    await rpc(
      "initialize",
      {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: "bloxsmith", version: "1.0.0" },
      },
      1,
    );
    await fetch(server.url, {
      method: "POST",
      headers: mcpHttpHeaders(authHeader),
      body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
    }).catch(() => null);
    const list = await rpc("tools/list", {}, 2);
    const tools = (list?.tools ?? []) as Array<{ name: string; description?: string }>;
    const trimmed = tools
      .slice(0, 20)
      .map((t) => ({ name: t.name, description: t.description ?? "" }));
    const latencyMs = Date.now() - started;
    await supabase
      .from("user_mcp_servers")
      .update({
        last_tested_at: new Date().toISOString(),
        last_test_ok: true,
        last_test_error: null,
        tool_count: tools.length,
        tools_cache: trimmed,
      })
      .eq("id", serverId);
    return { ok: true, toolCount: tools.length, tools: trimmed, latencyMs };
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    const latencyMs = Date.now() - started;
    await supabase
      .from("user_mcp_servers")
      .update({
        last_tested_at: new Date().toISOString(),
        last_test_ok: false,
        last_test_error: msg,
      })
      .eq("id", serverId);
    return { ok: false, error: msg, latencyMs };
  }
}

export const testMcpServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ serverId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    return runMcpHealthCheck(supabase, userId, data.serverId);
  });

/**
 * Re-tests every enabled MCP server for the user in parallel (capped).
 * Returns a per-server result plus aggregate counts + average latency.
 */
export const retestAllMcpServers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: servers, error } = await supabase
      .from("user_mcp_servers")
      .select("id,name")
      .eq("user_id", userId)
      .eq("enabled", true);
    if (error) throw new Error(error.message);
    const list = servers ?? [];
    if (list.length === 0) {
      return { tested: 0, ok: 0, failed: 0, avgLatencyMs: 0, results: [] as any[] };
    }

    // Bound concurrency to 4 to avoid hammering remote MCP hosts.
    const results: Array<{
      id: string;
      name: string;
      ok: boolean;
      latencyMs: number;
      error?: string;
      toolCount?: number;
    }> = [];
    const queue = [...list];
    const workers = Array.from({ length: Math.min(4, queue.length) }, async () => {
      while (queue.length > 0) {
        const s = queue.shift()!;
        const r = await runMcpHealthCheck(supabase, userId, s.id);
        results.push({
          id: s.id,
          name: s.name,
          ok: r.ok,
          latencyMs: r.latencyMs,
          ...(r.ok ? { toolCount: r.toolCount } : { error: r.error }),
        });
      }
    });
    await Promise.all(workers);

    const ok = results.filter((r) => r.ok).length;
    const failed = results.length - ok;
    const avg = Math.round(results.reduce((n, r) => n + r.latencyMs, 0) / results.length);
    return { tested: results.length, ok, failed, avgLatencyMs: avg, results };
  });
