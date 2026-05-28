import { tool } from "ai";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  isOwnMcpUrl,
  mcpHttpHeaders,
  normalizeMcpAuthHeader,
  parseMcpHttpResponse,
  MCP_PROTOCOL_VERSION,
} from "./mcp-rpc-utils";

// Minimal MCP Streamable HTTP JSON-RPC client.
// Initializes per request, lists tools, and exposes a single callable.

type McpServer = {
  id: string;
  name: string;
  url: string;
  auth_header: string | null;
};

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
  await supabaseAdmin
    .from("mcp_tokens")
    .upsert(
      { user_id: userId, token_hash: hash, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
  return token;
}

async function resolveAuthHeader(server: McpServer, userId: string): Promise<string> {
  if (isOwnMcpUrl(server.url)) {
    const adminSecret = process.env.MCP_SECRET;
    if (adminSecret) return `Bearer ${adminSecret}`;
    const token = await ensureOwnToken(userId);
    return `Bearer ${token}`;
  }
  return normalizeMcpAuthHeader(server.auth_header);
}

async function mcpRpc(server: McpServer, authHeader: string, method: string, params?: any, id = 1) {
  const r = await fetch(server.url, {
    method: "POST",
    headers: mcpHttpHeaders(authHeader),
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
  if (!r.ok) {
    if (r.status === 401 || r.status === 403) {
      throw new Error(
        `MCP ${server.name}: ${r.status} Unauthorized — token in /mcp-servers is missing or invalid. Update it and try again.`,
      );
    }
    throw new Error(`MCP ${server.name} HTTP ${r.status}`);
  }
  const data = await parseMcpHttpResponse(r);
  if (data.error) throw new Error(`MCP ${server.name}: ${data.error.message}`);
  return data.result;
}

async function initAndList(server: McpServer, authHeader: string) {
  await mcpRpc(server, authHeader, "initialize", {
    protocolVersion: MCP_PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: "bloxsmith", version: "1.0.0" },
  });
  // Streamable HTTP servers expect a notification after initialize
  try {
    await fetch(server.url, {
      method: "POST",
      headers: mcpHttpHeaders(authHeader),
      body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
    });
  } catch {}
  const result = await mcpRpc(server, authHeader, "tools/list", {}, 2);
  return (result?.tools ?? []) as Array<{
    name: string;
    description?: string;
    inputSchema?: any;
  }>;
}

function sanitizeName(s: string) {
  return s.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 50);
}

// Build AI SDK tool wrappers for every tool exposed by every user MCP server.
export async function buildUserMcpTools(userId: string) {
  const { data: servers } = await supabaseAdmin
    .from("user_mcp_servers")
    .select("id,name,url,auth_header")
    .eq("user_id", userId)
    .eq("enabled", true);
  if (!servers || servers.length === 0) return {};

  const tools: Record<string, any> = {};
  await Promise.all(
    servers.map(async (s) => {
      const server = s as McpServer;
      let authHeader = "";
      try {
        authHeader = await resolveAuthHeader(server, userId);
      } catch (e) {
        console.error(`[mcp] could not resolve auth for ${server.name}:`, e);
        return;
      }
      try {
        const list = await initAndList(server, authHeader);
        for (const t of list) {
          const key = `mcp_${sanitizeName(server.name)}_${sanitizeName(t.name)}`;
          tools[key] = tool({
            description: `[MCP:${server.name}] ${t.description ?? t.name}`,
            inputSchema: z.object({}).passthrough(),
            execute: async (args: any) => {
              try {
                const res = await mcpRpc(
                  server,
                  authHeader,
                  "tools/call",
                  { name: t.name, arguments: args ?? {} },
                  Date.now(),
                );
                return res;
              } catch (e: any) {
                return { error: e?.message ?? String(e) };
              }
            },
          });
        }
      } catch (e) {
        console.error(`[mcp] failed to load ${server.name}:`, e);
      }
    }),
  );
  return tools;
}
