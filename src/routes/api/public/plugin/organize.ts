import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-plugin-token",
  "Content-Type": "application/json",
};

async function sha256(text: string) {
  const buf = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function userFromToken(token: string | null) {
  if (!token) return null;
  const hash = await sha256(token);
  const { data } = await supabaseAdmin
    .from("plugin_tokens")
    .select("user_id")
    .eq("token_hash", hash)
    .maybeSingle();
  return data?.user_id ?? null;
}

const ALLOWED_TYPES = new Set(["organize", "move", "rename"]);

// Compact the live workspace snapshot down to (path, className) tuples so
// the prompt stays small. We only need names + class to plan organization.
function flattenTree(
  node: any,
  parentPath: string,
  out: Array<{ path: string; className: string }>,
  limit = 400,
) {
  if (!node || out.length >= limit) return;
  const name = node.name ?? node.Name ?? "?";
  const path = parentPath ? `${parentPath}.${name}` : name;
  const className = node.className ?? node.ClassName ?? "Instance";
  if (parentPath) out.push({ path, className });
  const children = node.children ?? node.Children ?? [];
  for (const c of children) flattenTree(c, path, out, limit);
}

export const Route = createFileRoute("/api/public/plugin/organize")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors }),
      POST: async ({ request }) => {
        const userId = await userFromToken(request.headers.get("x-plugin-token"));
        if (!userId)
          return new Response(JSON.stringify({ error: "invalid token" }), {
            status: 401,
            headers: cors,
          });

        const body = await request.json().catch(() => ({}));
        const projectId = body?.projectId;
        const ignores: string[] = Array.isArray(body?.ignores)
          ? body.ignores
              .filter((s: unknown) => typeof s === "string")
              .map((s: string) => s.trim().toLowerCase())
              .filter(Boolean)
          : [];
        const isIgnored = (p: unknown) => {
          if (typeof p !== "string" || !p || ignores.length === 0) return false;
          const lower = p.toLowerCase();
          const segments = lower.split(/[./]/).filter(Boolean);
          for (const pat of ignores) {
            if (segments.includes(pat)) return true;
            if (lower.includes(pat)) return true;
          }
          return false;
        };
        if (!projectId)
          return new Response(JSON.stringify({ error: "missing projectId" }), {
            status: 400,
            headers: cors,
          });

        // Verify ownership. Projects are private per account.
        const { data: project } = await supabaseAdmin
          .from("projects")
          .select("id,user_id,name")
          .eq("id", projectId)
          .maybeSingle();
        if (!project)
          return new Response(JSON.stringify({ error: "not found" }), {
            status: 404,
            headers: cors,
          });
        if (project.user_id !== userId)
          return new Response(JSON.stringify({ error: "forbidden" }), {
            status: 403,
            headers: cors,
          });

        // Pull the latest workspace snapshot the plugin reported
        const { data: ctxRow } = await supabaseAdmin
          .from("plugin_context")
          .select("context,instance_count,updated_at")
          .eq("project_id", projectId)
          .maybeSingle();
        if (!ctxRow?.context)
          return new Response(
            JSON.stringify({
              error:
                "No workspace context yet. Connect the plugin and let it scan your project once before organizing.",
            }),
            { status: 409, headers: cors },
          );

        // Flatten tree → compact list for the prompt
        const instances: Array<{ path: string; className: string }> = [];
        const ctx = ctxRow.context as any;
        const services = (ctx?.services ?? ctx?.tree ?? ctx?.workspace) ? [ctx] : [];
        // Try common shapes
        if (Array.isArray(ctx?.services)) {
          for (const svc of ctx.services) flattenTree(svc, "", instances, 500);
        } else if (Array.isArray(ctx?.tree)) {
          for (const node of ctx.tree) flattenTree(node, "", instances, 500);
        } else {
          flattenTree(ctx, "", instances, 500);
        }
        void services;

        // Drop any instance that lives under an ignored path/segment.
        const visibleInstances = instances.filter((i) => !isIgnored(i.path));

        if (visibleInstances.length === 0)
          return new Response(
            JSON.stringify({
              error:
                ignores.length > 0
                  ? "Every instance in the snapshot matched your ignore filters — nothing left to organize."
                  : "Workspace snapshot is empty — nothing to organize yet.",
            }),
            { status: 409, headers: cors },
          );

        // Ask Groq (already configured) for ONLY organize/move/rename actions.
        const apiKey = process.env.GROQ_API_KEY;
        if (!apiKey)
          return new Response(JSON.stringify({ error: "AI not configured on server" }), {
            status: 500,
            headers: cors,
          });

        const systemPrompt = `You are BloxSmith's workspace organizer. Given the current Roblox Studio workspace tree, propose a tidy structure using ONLY these action types: "organize", "move", and "rename".

Rules:
- Group related loose instances under named Folders (Props, Lights, Effects, NPCs, Maps, Tools, UI, etc.) using "organize" actions.
- Move misplaced scripts/modules to the correct service (Scripts → ServerScriptService, LocalScripts → StarterPlayer/StarterPlayerScripts, ModuleScripts shared → ReplicatedStorage).
- Rename generic names ("Part", "Part1", "Script", "Folder") to clear PascalCase names when their purpose is obvious from siblings or class.
- NEVER include any other action types. NEVER delete or create new instances besides organizing folders.
- Keep the total number of actions reasonable (max 40).
- Output strict JSON only: { "actions": [ ... ] }. No markdown, no commentary.

Action shapes:
- { "type":"organize", "parent":"Workspace", "container":"Folder", "name":"Props", "items":["Workspace.Tree1","Workspace.Rock"] }
- { "type":"move", "path":"Workspace.LooseScript", "newParent":"ServerScriptService" }
- { "type":"rename", "path":"Workspace.Part42", "newName":"Floor" }`;

        const userPrompt =
          `Project: ${project.name}\n` +
          `Instance count: ${ctxRow.instance_count}\n` +
          (ignores.length > 0
            ? `IGNORE these locations / names (do NOT reference them in any action): ${ignores.join(", ")}\n`
            : "") +
          `Workspace tree (path : ClassName), truncated to ${visibleInstances.length} entries:\n` +
          visibleInstances.map((i) => `${i.path} : ${i.className}`).join("\n") +
          `\n\nReturn the JSON plan now.`;

        let aiJson: any = null;
        try {
          const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "llama-3.3-70b-versatile",
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt },
              ],
              response_format: { type: "json_object" },
              temperature: 0.2,
            }),
          });
          if (!res.ok) {
            const t = await res.text();
            return new Response(
              JSON.stringify({ error: `AI error ${res.status}: ${t.slice(0, 200)}` }),
              { status: 502, headers: cors },
            );
          }
          const data = await res.json();
          const content = data?.choices?.[0]?.message?.content ?? "{}";
          aiJson = JSON.parse(content);
        } catch (e: any) {
          return new Response(
            JSON.stringify({ error: "AI request failed: " + String(e?.message ?? e) }),
            { status: 502, headers: cors },
          );
        }

        const actionTouchesIgnored = (a: any) => {
          if (isIgnored(a?.path) || isIgnored(a?.newParent) || isIgnored(a?.parent)) return true;
          const items = a?.items ?? a?.objects ?? a?.paths;
          if (Array.isArray(items) && items.some((p: unknown) => isIgnored(p))) return true;
          return false;
        };

        const rawActions: any[] = Array.isArray(aiJson?.actions) ? aiJson.actions : [];
        const filtered = rawActions
          .filter((a) => a && typeof a === "object" && ALLOWED_TYPES.has(a.type))
          .filter((a) => !actionTouchesIgnored(a))
          .slice(0, 40);

        if (filtered.length === 0) {
          return new Response(
            JSON.stringify({
              queued: 0,
              message: "AI couldn't find anything to reorganize.",
            }),
            { headers: cors },
          );
        }

        // Enqueue into plugin_actions — the plugin's existing pull loop will deliver them.
        const rows = filtered.map((a) => ({
          project_id: projectId,
          user_id: project.user_id,
          action_type: a.type as string,
          payload: a as any,
          status: "pending" as const,
        }));
        const { error: insertErr } = await supabaseAdmin.from("plugin_actions").insert(rows);
        if (insertErr) {
          return new Response(
            JSON.stringify({ error: "Failed to queue actions: " + insertErr.message }),
            { status: 500, headers: cors },
          );
        }

        return new Response(
          JSON.stringify({
            queued: filtered.length,
            message: `Queued ${filtered.length} organize/move/rename action(s). They'll apply on the next plugin sync.`,
          }),
          { headers: cors },
        );
      },
    },
  },
});
