import { createFileRoute } from "@tanstack/react-router";
import { createMcpServer, withMcpAuth } from "mcp-tanstack-start";
import {
  buildRobloxTool,
  listProjectFilesTool,
  readProjectFileTool,
  listProjectsTool,
  searchToolboxTool,
  searchRobloxDocsTool,
  mcpConnectionHelpTool,
} from "@/lib/mcp/tools/bloxsmith";
import { MCP_PROTOCOL_VERSION } from "@/lib/mcp-rpc-utils";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const mcp = createMcpServer({
  name: "bloxsmith",
  version: "1.0.0",
  instructions:
    "BloxSmith MCP server — use these tools to build, modify, and extend Roblox games inside the user's BloxSmith projects. Call `list_my_projects` first to discover a projectId, then `build_roblox` with a natural-language prompt to write scripts and queue Studio actions. Use `list_project_files` + `read_project_file` to inspect existing code before editing. Use `search_roblox_docs` for Roblox API facts and `search_roblox_toolbox` for free assets.",
  tools: [
    buildRobloxTool,
    listProjectFilesTool,
    readProjectFileTool,
    listProjectsTool,
    searchToolboxTool,
    searchRobloxDocsTool,
    mcpConnectionHelpTool,
  ],
  transport: {
    enableJsonResponse: true,
    allowedOrigins: [
      "https://bloxsmith.pro",
      "https://www.bloxsmith.pro",
      "https://vscode.dev",
      "https://github.dev",
      "http://localhost",
      "https://localhost",
      "http://127.0.0.1",
      "https://127.0.0.1",
    ],
  },
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Accept, Authorization, X-Bloxsmith-Api-Key, X-API-Key, API-Key, MCP-Protocol-Version, Mcp-Session-Id, Last-Event-ID",
  "Access-Control-Expose-Headers": "MCP-Protocol-Version, Mcp-Session-Id, WWW-Authenticate",
  "MCP-Protocol-Version": MCP_PROTOCOL_VERSION,
};

const methodNotAllowed = () =>
  new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed." },
      id: null,
    }),
    {
      status: 405,
      headers: { "Content-Type": "application/json", Allow: "GET, POST, OPTIONS", ...corsHeaders },
    },
  );

function withCors(response: Response) {
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: { ...Object.fromEntries(response.headers.entries()), ...corsHeaders },
  });
}

function mcpErrorResponse(err: any) {
  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      error: { code: -32603, message: err?.message ?? "MCP server error" },
      id: null,
    }),
    { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } },
  );
}

// Public discovery — returns tool metadata (name, description, JSON schema) with NO auth.
// Execution still requires a Bearer bsmcp_... token via POST. Safe to expose.
function publicDiscovery() {
  const tools = [
    buildRobloxTool,
    listProjectFilesTool,
    readProjectFileTool,
    listProjectsTool,
    searchToolboxTool,
    searchRobloxDocsTool,
    mcpConnectionHelpTool,
  ].map((t: any) => {
    let inputSchema: unknown = { type: "object" };
    try {
      // zod-to-json-schema is not available here; emit a minimal shape.
      const shape = t.parameters?._def?.shape?.();
      if (shape) {
        inputSchema = {
          type: "object",
          properties: Object.fromEntries(
            Object.keys(shape).map((k) => [k, { description: shape[k]?.description ?? "" }]),
          ),
          required: Object.keys(shape).filter((k) => !shape[k]?.isOptional?.()),
        };
      }
    } catch {
      // ignore
    }
    return { name: t.name, description: t.description, inputSchema };
  });
  return new Response(
    JSON.stringify({
      name: "bloxsmith",
      version: "1.0.0",
      description:
        "BloxSmith MCP server. POST tools/call requests with Authorization: Bearer bsmcp_… (generate a token at https://bloxsmith.pro/mcp).",
      endpoint: "https://bloxsmith.pro/api/public/mcp",
      transport: "streamable-http",
      protocolVersion: MCP_PROTOCOL_VERSION,
      auth: { type: "bearer", scheme: "bsmcp_", obtain_token_url: "https://bloxsmith.pro/mcp" },
      ide_setup: {
        claude_code: {
          type: "http",
          url: "https://bloxsmith.pro/api/public/mcp",
          headers: { Authorization: "Bearer YOUR_MCP_TOKEN" },
        },
        codex_toml:
          '[mcp_servers.bloxsmith]\ntype = "http"\nurl = "https://bloxsmith.pro/api/public/mcp"\nheaders = { Authorization = "Bearer YOUR_MCP_TOKEN" }',
        vscode_mcp_json: {
          servers: {
            bloxsmith: {
              type: "http",
              url: "https://bloxsmith.pro/api/public/mcp",
              headers: { Authorization: "Bearer YOUR_MCP_TOKEN" },
            },
          },
        },
        cursor_windsurf_json: {
          mcpServers: {
            bloxsmith: {
              url: "https://bloxsmith.pro/api/public/mcp",
              headers: { Authorization: "Bearer YOUR_MCP_TOKEN" },
            },
          },
        },
        stdio_bridge:
          'npx -y mcp-remote https://bloxsmith.pro/api/public/mcp --header "Authorization: Bearer YOUR_MCP_TOKEN"',
      },
      tools,
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    },
  );
}

async function sha256(text: string) {
  const buf = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function detectClient(ua: string | null): string {
  if (!ua) return "Unknown client";
  const s = ua.toLowerCase();
  if (s.includes("codex")) return "ChatGPT Codex";
  if (s.includes("claude-code")) return "Claude Code";
  if (s.includes("claude")) return "Claude";
  if (s.includes("antigravity")) return "Antigravity";
  if (s.includes("cursor")) return "Cursor";
  if (s.includes("vscode") || s.includes("visual studio code")) return "VS Code";
  if (s.includes("copilot")) return "GitHub Copilot";
  if (s.includes("cline")) return "Cline";
  if (s.includes("windsurf")) return "Windsurf";
  if (s.includes("continue")) return "Continue";
  if (s.includes("zed")) return "Zed";
  if (s.includes("openai")) return "OpenAI client";
  if (s.includes("anthropic")) return "Anthropic client";
  if (s.includes("mcp")) return "MCP client";
  // Fall back to first token of UA
  return ua.split(/[\s/]/)[0]?.slice(0, 40) || "Unknown client";
}

function recordTokenAttempt(userId: string, ok: boolean, ua: string | null, error?: string) {
  const now = new Date().toISOString();
  const client = detectClient(ua);
  supabaseAdmin
    .from("mcp_tokens")
    .update({
      last_attempt_at: now,
      last_attempt_ok: ok,
      last_attempt_error: ok ? null : (error ?? "auth failed"),
      last_client: client,
      last_user_agent: ua ?? null,
      ...(ok ? { last_used_at: now } : {}),
    })
    .eq("user_id", userId)
    .then(
      () => {},
      () => {},
    );
}

function authError(message: string, hint?: string) {
  const fullMessage = hint ? `${message} ${hint}` : message;
  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      error: {
        code: -32001,
        message: fullMessage,
        data: { reason: message, hint, docs: "https://bloxsmith.pro/mcp" },
      },
      id: null,
    }),
    {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        "WWW-Authenticate": 'Bearer realm="bloxsmith-mcp"',
        ...corsHeaders,
      },
    },
  );
}

async function authenticate(request: Request) {
  const authHeader = request.headers.get("Authorization") ?? request.headers.get("authorization");
  const apiKeyHeader =
    request.headers.get("X-Bloxsmith-Api-Key") ??
    request.headers.get("x-bloxsmith-api-key") ??
    request.headers.get("X-API-Key") ??
    request.headers.get("x-api-key") ??
    request.headers.get("API-Key") ??
    request.headers.get("api-key");
  const hasAuthHeader = !!authHeader;
  const hasApiKeyHeader = !!apiKeyHeader;
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim() || apiKeyHeader?.trim() || "";
  const ua = request.headers.get("User-Agent");
  const client = detectClient(ua);
  const path = new URL(request.url).pathname;
  const prefix = token ? token.slice(0, 8) + "…" : "(none)";

  console.log(
    `[mcp] POST ${path} auth_header=${hasAuthHeader ? "yes" : "no"} api_key_header=${hasApiKeyHeader ? "yes" : "no"} prefix=${prefix} client=${client}`,
  );

  if (!token) {
    return {
      ok: false as const,
      response: authError(
        "Missing Authorization header.",
        "Send `Authorization: Bearer <bsmcp_…>` (or `X-Bloxsmith-Api-Key`). Generate a token at https://bloxsmith.pro/mcp.",
      ),
    };
  }

  const adminSecret = process.env.MCP_SECRET;
  if (adminSecret && token === adminSecret) {
    console.log(`[mcp] auth: admin secret accepted (internal server-to-server)`);
    return { ok: true as const, auth: { token, claims: { scope: "admin", userId: null } } };
  }

  if (!token.startsWith("bsmcp_") && !token.startsWith("bsoa_")) {
    console.log(`[mcp] auth: invalid prefix (prefix=${prefix})`);
    return {
      ok: false as const,
      response: authError(
        "Invalid MCP token format.",
        "Tokens must start with 'bsmcp_' (manual) or 'bsoa_' (OAuth-issued). Generate one at https://bloxsmith.pro/mcp.",
      ),
    };
  }

  const hash = await sha256(token);
  let userId: string | null = null;

  if (token.startsWith("bsoa_")) {
    const { data: oauthRow, error: oauthErr } = await supabaseAdmin
      .from("oauth_access_tokens")
      .select("user_id, expires_at")
      .eq("token_hash", hash)
      .maybeSingle();
    if (oauthErr) {
      console.error(`[mcp] auth: oauth db lookup error`, oauthErr.message);
      return {
        ok: false as const,
        response: authError("Auth service temporarily unavailable.", "Please retry in a moment."),
      };
    }
    if (!oauthRow) {
      return {
        ok: false as const,
        response: authError(
          "Invalid or revoked OAuth token.",
          "Reconnect from your MCP client (e.g. Claude.ai → Connectors → BloxSmith).",
        ),
      };
    }
    if (oauthRow.expires_at && new Date(oauthRow.expires_at).getTime() < Date.now()) {
      return {
        ok: false as const,
        response: authError("OAuth token expired.", "Reconnect from your MCP client."),
      };
    }
    userId = oauthRow.user_id as string;
    // Best-effort update of last_used_at
    void supabaseAdmin
      .from("oauth_access_tokens")
      .update({ last_used_at: new Date().toISOString() })
      .eq("token_hash", hash);
  } else {
    const { data, error } = await supabaseAdmin
      .from("mcp_tokens")
      .select("user_id")
      .eq("token_hash", hash)
      .maybeSingle();
    if (error) {
      console.error(`[mcp] auth: db lookup error`, error.message);
      return {
        ok: false as const,
        response: authError("Auth service temporarily unavailable.", "Please retry in a moment."),
      };
    }
    if (!data) {
      console.log(`[mcp] auth: token not found (prefix=${prefix}, client=${client})`);
      return {
        ok: false as const,
        response: authError(
          "Invalid, revoked, or wrong-environment MCP token.",
          "Tokens generated on localhost/127.0.0.1 do NOT work against https://bloxsmith.pro. Generate a production token at https://bloxsmith.pro/mcp.",
        ),
      };
    }
    userId = data.user_id as string;
  }

  // Reuse existing downstream code that expects `data.user_id`
  const data = { user_id: userId! };

  const { data: userRow, error: userErr } = await supabaseAdmin
    .from("profiles")
    .select("id,banned")
    .eq("id", data.user_id)
    .maybeSingle();
  if (userErr || !userRow) {
    console.log(`[mcp] auth: user not found user=${data.user_id}`);
    recordTokenAttempt(data.user_id, false, ua, "user not found");
    return {
      ok: false as const,
      response: authError(
        "User account not found.",
        "Sign in at https://bloxsmith.pro and regenerate your token.",
      ),
    };
  }
  if (userRow.banned) {
    recordTokenAttempt(data.user_id, false, ua, "account suspended");
    return {
      ok: false as const,
      response: authError("Account suspended.", "Contact support."),
    };
  }

  console.log(`[mcp] auth: ok user=${data.user_id} prefix=${prefix} client=${client} path=${path}`);
  recordTokenAttempt(data.user_id, true, ua);
  return { ok: true as const, auth: { token, claims: { scope: "user", userId: data.user_id } } };
}

export const Route = createFileRoute("/api/public/mcp")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const result = await authenticate(request);
        if (!result.ok) return result.response;
        try {
          const response = await mcp.handleRequest(request, { auth: result.auth });
          return withCors(response);
        } catch (err: any) {
          return mcpErrorResponse(err);
        }
      },
      GET: async ({ request }) => {
        const wantsStream = /\btext\/event-stream\b/i.test(request.headers.get("Accept") ?? "");
        const hasAuth =
          request.headers.has("Authorization") ||
          request.headers.has("authorization") ||
          request.headers.has("X-Bloxsmith-Api-Key") ||
          request.headers.has("X-API-Key");
        if (wantsStream || hasAuth) {
          const result = await authenticate(request);
          if (!result.ok) return result.response;
          try {
            const response = await mcp.handleRequest(request, { auth: result.auth });
            return withCors(response);
          } catch (err: any) {
            return mcpErrorResponse(err);
          }
        }
        return publicDiscovery();
      },
      DELETE: async () => methodNotAllowed(),
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),
    },
  },
});

// Keep withMcpAuth import referenced (no longer used directly).
void withMcpAuth;
