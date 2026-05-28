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

export const Route = createFileRoute("/api/public/plugin/sync")({
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
        const manual = body?.manual === true;
        if (!projectId)
          return new Response(JSON.stringify({ error: "missing projectId" }), {
            status: 400,
            headers: cors,
          });

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

        // Respect the project owner's "Manual sync only" preference
        const { data: ownerProfile } = await supabaseAdmin
          .from("profiles")
          .select("manual_sync_only")
          .eq("id", project.user_id)
          .maybeSingle();
        const manualOnly = ownerProfile?.manual_sync_only === true;
        const shouldDeliver = manual || !manualOnly;

        // Pull pending actions (queued by the AI) — cap to 200 per pull
        const { data: pending } = shouldDeliver
          ? await supabaseAdmin
              .from("plugin_actions")
              .select("id,action_type,payload,created_at")
              .eq("project_id", projectId)
              .eq("status", "pending")
              .order("created_at", { ascending: true })
              .limit(200)
          : {
              data: [] as Array<{
                id: string;
                action_type: string;
                payload: unknown;
                created_at: string;
              }>,
            };

        const actions = (pending ?? []).map((row) => ({
          id: row.id,
          type: row.action_type,
          rev: row.created_at,
          ...(typeof row.payload === "object" && row.payload ? row.payload : {}),
        }));

        // Mark as delivered so plugin doesn't re-execute on next poll
        if (pending && pending.length > 0) {
          const ids = pending.map((p) => p.id);
          await supabaseAdmin
            .from("plugin_actions")
            .update({ status: "delivered", delivered_at: new Date().toISOString() })
            .in("id", ids);
        }

        // NOTE: We intentionally do NOT return project_files here anymore.
        // The plugin used to re-materialize every file on every poll, which
        // caused duplicate / recursively-nested folders in Studio. Files now
        // arrive only via explicit, idempotent actions queued by the AI.
        return new Response(
          JSON.stringify({
            project: { id: project.id, name: project.name },
            actions,
          }),
          { headers: cors },
        );
      },
    },
  },
});
