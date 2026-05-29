import { defineTool } from "mcp-tanstack-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { MCP_PROTOCOL_VERSION } from "@/lib/mcp-rpc-utils";
import { searchRobloxDocs } from "@/lib/roblox-docs.server";

// Extract authenticated userId from MCP tool execution context. Admin scope
// (workspace MCP_SECRET) is allowed to act with no userId constraint.
function getAuth(context: any): { userId: string | null; isAdmin: boolean } {
  const claims = (context?.auth?.claims ?? {}) as { userId?: string | null; scope?: string };
  return { userId: claims.userId ?? null, isAdmin: claims.scope === "admin" };
}

async function assertProjectAccess(projectId: string, userId: string | null, isAdmin: boolean) {
  if (isAdmin) return;
  if (!userId) throw new Error("Unauthorized.");
  const { data: proj } = await supabaseAdmin
    .from("projects")
    .select("user_id")
    .eq("id", projectId)
    .maybeSingle();
  if (!proj) throw new Error(`Project ${projectId} not found.`);
  if (proj.user_id === userId) return;
  throw new Error("Forbidden: you do not own that project.");
}

// Internal helper: run the same generation pipeline used by the website,
// but persist files + queue plugin actions immediately (no preview gate).
async function runBuild(projectId: string, prompt: string, callerUserId: string) {
  // Verify project exists, capture owner for plugin_actions FK.
  const { data: project, error: projErr } = await supabaseAdmin
    .from("projects")
    .select("id,user_id")
    .eq("id", projectId)
    .maybeSingle();
  if (projErr || !project) throw new Error(`Project ${projectId} not found.`);

  // Atomically spend 1 credit from the CALLER (not project owner) to prevent
  // draining a victim's credits via MCP tokens.
  const { data: prof, error: profErr } = await supabaseAdmin
    .from("profiles")
    .select("credits")
    .eq("id", callerUserId)
    .maybeSingle();
  if (profErr || !prof) throw new Error("Caller profile not found.");
  if ((prof.credits ?? 0) < 1) {
    throw new Error(
      "Out of BloxSmith credits. Top up at https://bloxsmith.pro/settings before running more MCP builds.",
    );
  }
  // Conditional update guards against concurrent races: only succeeds if
  // credits are still >= 1 at write time.
  const { data: spent } = await supabaseAdmin
    .from("profiles")
    .update({ credits: (prof.credits ?? 0) - 1 })
    .eq("id", callerUserId)
    .gte("credits", 1)
    .select("credits")
    .maybeSingle();
  if (!spent) throw new Error("Could not spend credit (concurrent update).");

  const { generateText, stepCountIs } = await import("ai");
  const { SYSTEM_PROMPT } = await import("@/lib/ai-gateway.server");
  const { resolveBuiltInGateway } = await import("@/lib/ai-providers.server");
  const { buildBloxSmithTools } = await import("@/lib/ai-tools.server");

  const model = resolveBuiltInGateway({ kind: "build" }).model;

  const { data: liveContext } = await supabaseAdmin
    .from("plugin_context")
    .select("context,instance_count,updated_at")
    .eq("project_id", projectId)
    .maybeSingle();
  const { data: existingFiles } = await supabaseAdmin
    .from("project_files")
    .select("path,file_type,service_location,content")
    .eq("project_id", projectId)
    .limit(15);

  const filesBlock = (existingFiles ?? [])
    .map(
      (f) =>
        `--- ${f.path} (${f.file_type} in ${f.service_location}) ---\n${(f.content ?? "").slice(0, 300)}`,
    )
    .join("\n\n")
    .slice(0, 4000);
  const liveBlock = liveContext?.context
    ? `LIVE STUDIO (${liveContext.instance_count} instances):\n${JSON.stringify(liveContext.context).slice(0, 2500)}`
    : "LIVE STUDIO: (empty baseplate)";

  const fullPrompt = `${liveBlock}\n\nProject files:\n${filesBlock || "(empty)"}\n\nUser request:\n${prompt}`;

  const { text: rawText } = await generateText({
    model,
    system: SYSTEM_PROMPT,
    prompt: fullPrompt,
    tools: buildBloxSmithTools({ projectId }) as any,
    stopWhen: stepCountIs(30),
  });

  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  let result: { message: string; files: any[]; actions: any[] };
  try {
    result = jsonMatch
      ? JSON.parse(jsonMatch[0])
      : { message: rawText.trim(), files: [], actions: [] };
  } catch {
    result = { message: rawText.trim(), files: [], actions: [] };
  }
  result.files = result.files ?? [];
  result.actions = result.actions ?? [];

  const { validateGenerated } = await import("@/lib/sync-validation");
  const validation = validateGenerated(result.files as any, result.actions as any, []);
  result.files = validation.files as any;
  result.actions = validation.actions as any;

  // Persist files
  for (const f of result.files) {
    const { data: existing } = await supabaseAdmin
      .from("project_files")
      .select("id")
      .eq("project_id", projectId)
      .eq("path", f.path)
      .maybeSingle();
    if (existing) {
      await supabaseAdmin
        .from("project_files")
        .update({
          content: f.content,
          file_type: f.file_type,
          service_location: f.service_location,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
    } else {
      await supabaseAdmin.from("project_files").insert({
        project_id: projectId,
        path: f.path,
        file_type: f.file_type,
        service_location: f.service_location,
        content: f.content,
      });
    }
  }

  // Build & queue actions (scripts derived from files + structural actions)
  const queued: any[] = [];
  for (const f of result.files) {
    const segments = f.path.split("/");
    const name = segments[segments.length - 1];
    queued.push({
      type: "script",
      parent: f.service_location,
      name,
      className: f.file_type,
      source: f.content,
    });
  }
  for (const a of result.actions) {
    if (a && typeof a === "object" && typeof a.type === "string") queued.push(a);
  }

  const { data: genRow } = await (supabaseAdmin as any)
    .from("generations")
    .insert({
      user_id: callerUserId,
      project_id: projectId,
      prompt,
      status: "success",
      credits_used: 1,
      result: { ...result, _queued: queued, _source: "mcp" } as any,
    })
    .select("id")
    .single();

  if (queued.length > 0) {
    const rows = queued.map((a) => ({
      project_id: projectId,
      user_id: project.user_id,
      action_type: a.type,
      payload: { ...a, generation_id: genRow?.id ?? null },
      status: "pending",
    }));
    await supabaseAdmin.from("plugin_actions").insert(rows);
  }

  return {
    message: result.message,
    filesWritten: result.files.length,
    actionsQueued: queued.length,
    generationId: genRow?.id ?? null,
    validationWarnings: validation.warnings,
    validationErrors: validation.errors,
  };
}

export const buildRobloxTool = defineTool({
  name: "build_roblox",
  description:
    "Build, modify, or extend a Roblox game in the user's BloxSmith project. Pass a natural-language prompt (e.g. 'add a sword combat system', 'make an obby with 10 stages', 'create stormy weather'). Files are written and actions are queued for the user's Studio plugin to apply automatically.",
  parameters: z.object({
    projectId: z.string().uuid().describe("BloxSmith project UUID to build into."),
    prompt: z.string().min(1).max(8000).describe("What to build, in natural language."),
  }),
  execute: async ({ projectId, prompt }, context) => {
    const { userId, isAdmin } = getAuth(context);
    await assertProjectAccess(projectId, userId, isAdmin);
    // For admin scope, fall back to the project owner so we don't crash.
    let billUserId = userId;
    if (!billUserId) {
      const { data: p } = await supabaseAdmin
        .from("projects")
        .select("user_id")
        .eq("id", projectId)
        .maybeSingle();
      billUserId = p?.user_id ?? null;
    }
    if (!billUserId) throw new Error("No user to bill credits to.");
    const r = await runBuild(projectId, prompt, billUserId);
    return JSON.stringify(r, null, 2);
  },
});

export const listProjectFilesTool = defineTool({
  name: "list_project_files",
  description: "List every script/file stored in a BloxSmith project.",
  parameters: z.object({ projectId: z.string().uuid() }),
  execute: async ({ projectId }, context) => {
    const { userId, isAdmin } = getAuth(context);
    await assertProjectAccess(projectId, userId, isAdmin);
    const { data, error } = await supabaseAdmin
      .from("project_files")
      .select("path,file_type,service_location,updated_at")
      .eq("project_id", projectId)
      .order("path");
    if (error) throw new Error(error.message);
    return JSON.stringify({ count: data?.length ?? 0, files: data ?? [] }, null, 2);
  },
});

export const readProjectFileTool = defineTool({
  name: "read_project_file",
  description: "Read the full source of one project file by exact path.",
  parameters: z.object({
    projectId: z.string().uuid(),
    path: z.string().min(1).max(500),
  }),
  execute: async ({ projectId, path }, context) => {
    const { userId, isAdmin } = getAuth(context);
    await assertProjectAccess(projectId, userId, isAdmin);
    const { data, error } = await supabaseAdmin
      .from("project_files")
      .select("path,file_type,service_location,content,updated_at")
      .eq("project_id", projectId)
      .eq("path", path)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error(`Not found: ${path}`);
    return JSON.stringify(data, null, 2);
  },
});

export const listProjectsTool = defineTool({
  name: "list_my_projects",
  description: "List the most recent BloxSmith projects (id + name) so you can pick a projectId.",
  parameters: z.object({
    limit: z.number().int().min(1).max(50).default(20),
  }),
  execute: async ({ limit }, context) => {
    const { userId, isAdmin } = getAuth(context);
    if (!userId && !isAdmin) throw new Error("Unauthorized.");

    // Owned projects
    const ownedIds = new Set<string>();
    if (userId) {
      const { data: owned } = await supabaseAdmin
        .from("projects")
        .select("id")
        .eq("user_id", userId);
      (owned ?? []).forEach((p) => ownedIds.add(p.id));
    }

    let query = supabaseAdmin
      .from("projects")
      .select("id,name,updated_at")
      .order("updated_at", { ascending: false })
      .limit(limit);

    if (!isAdmin) {
      const ids = Array.from(ownedIds);
      if (ids.length === 0) return JSON.stringify([], null, 2);
      query = query.in("id", ids);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return JSON.stringify(data ?? [], null, 2);
  },
});

export const searchToolboxTool = defineTool({
  name: "search_roblox_toolbox",
  description:
    "Search the Roblox catalog/toolbox for free assets (Models, Decals, Audio, Meshes, Animations).",
  parameters: z.object({
    query: z.string().min(1).max(120),
    category: z
      .enum(["Models", "Decals", "Audio", "Meshes", "Animations", "Gear", "Hats"])
      .default("Models"),
    limit: z.number().int().min(1).max(20).default(8),
  }),
  execute: async ({ query, category, limit }) => {
    const { searchRobloxAssets } = await import("@/lib/ai-tools.server");
    const items = await searchRobloxAssets(query, category, limit, {
      freeOnly: true,
      verifiedOnly: false,
    });
    return JSON.stringify({ count: items.length, items }, null, 2);
  },
});

export const searchRobloxDocsTool = defineTool({
  name: "search_roblox_docs",
  description:
    "Search official Roblox Creator Hub and Engine API documentation for Roblox services, Luau APIs, DataStores, remotes, MarketplaceService, UI, animation, pathfinding, terrain, and other implementation details.",
  parameters: z.object({
    query: z.string().min(2).max(200),
    limit: z.number().int().min(1).max(8).default(5),
  }),
  execute: async ({ query, limit }) => {
    const results = await searchRobloxDocs(query, limit);
    return JSON.stringify({ count: results.length, results }, null, 2);
  },
});

export const mcpConnectionHelpTool = defineTool({
  name: "mcp_connection_help",
  description:
    "Return setup snippets for connecting BloxSmith MCP from different IDEs and AI clients such as VS Code, Cursor, Windsurf, Claude Code, Codex, Zed, Continue, and generic Streamable HTTP clients.",
  parameters: z.object({
    client: z
      .enum(["claude_code", "codex", "vscode", "cursor", "windsurf", "zed", "continue", "generic"])
      .default("generic"),
  }),
  execute: async ({ client }) => {
    const endpoint = "https://bloxsmith.pro/api/public/mcp";
    const snippets: Record<string, unknown> = {
      claude_code: {
        file: "~/.claude.json",
        config: {
          mcpServers: {
            bloxsmith: {
              type: "http",
              url: endpoint,
              headers: { Authorization: "Bearer YOUR_MCP_TOKEN" },
            },
          },
        },
      },
      codex: {
        file: "~/.codex/config.toml",
        config: `[mcp_servers.bloxsmith]\ntype = "http"\nurl = "${endpoint}"\nheaders = { Authorization = "Bearer YOUR_MCP_TOKEN" }`,
      },
      vscode: {
        file: ".vscode/mcp.json",
        config: {
          servers: {
            bloxsmith: {
              type: "http",
              url: endpoint,
              headers: { Authorization: "Bearer YOUR_MCP_TOKEN" },
            },
          },
        },
      },
      cursor: {
        file: "~/.cursor/mcp.json",
        config: {
          mcpServers: {
            bloxsmith: { url: endpoint, headers: { Authorization: "Bearer YOUR_MCP_TOKEN" } },
          },
        },
      },
      windsurf: {
        file: "~/.codeium/windsurf/mcp_config.json",
        config: {
          mcpServers: {
            bloxsmith: { serverUrl: endpoint, headers: { Authorization: "Bearer YOUR_MCP_TOKEN" } },
          },
        },
      },
      zed: {
        file: "Zed settings.json",
        config: {
          context_servers: {
            bloxsmith: {
              source: "custom",
              url: endpoint,
              headers: { Authorization: "Bearer YOUR_MCP_TOKEN" },
            },
          },
        },
      },
      continue: {
        file: "config.yaml",
        config: {
          mcpServers: [
            {
              name: "bloxsmith",
              url: endpoint,
              headers: { Authorization: "Bearer YOUR_MCP_TOKEN" },
            },
          ],
        },
      },
      generic: {
        transport: "Streamable HTTP",
        endpoint,
        headers: {
          Authorization: "Bearer YOUR_MCP_TOKEN",
          Accept: "application/json, text/event-stream",
          "MCP-Protocol-Version": MCP_PROTOCOL_VERSION,
        },
      },
    };
    return JSON.stringify({ endpoint, client, setup: snippets[client] }, null, 2);
  },
});
