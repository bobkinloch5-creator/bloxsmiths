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

export const Route = createFileRoute("/api/studio/poll")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors }),
      POST: async ({ request }) => {
        try {
          const userId = await userFromToken(request.headers.get("x-plugin-token"));
          if (!userId)
            return new Response(JSON.stringify({ error: "invalid token" }), {
              status: 401,
              headers: cors,
            });

          const body = await request.json().catch(() => ({}));
          const projectId = body?.projectId;
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

          // Fetch pending actions
          const { data: pending } = await supabaseAdmin
            .from("plugin_actions")
            .select("id,action_type,payload,created_at")
            .eq("project_id", projectId)
            .eq("status", "pending")
            .order("created_at", { ascending: true })
            .limit(200);

          const actions = (pending ?? []).map((row) => ({
            id: row.id,
            type: row.action_type,
            rev: row.created_at,
            ...(typeof row.payload === "object" && row.payload ? row.payload : {}),
          }));

          // Mark as delivered
          if (pending && pending.length > 0) {
            const ids = pending.map((p) => p.id);
            await supabaseAdmin
              .from("plugin_actions")
              .update({ status: "delivered", delivered_at: new Date().toISOString() })
              .in("id", ids);
          }

          // Return current files as well for sync verification
          const { data: files } = await supabaseAdmin
            .from("project_files")
            .select("path,file_type,service_location,content,updated_at")
            .eq("project_id", projectId);

          return new Response(
            JSON.stringify({
              project: { id: project.id, name: project.name },
              actions,
              files: files ?? [],
            }),
            { headers: cors },
          );
        } catch (e: any) {
          console.error("API error in studio/poll:", e);
          return new Response(JSON.stringify({ error: "Internal server error" }), {
            status: 500,
            headers: cors,
          });
        }
      },
    },
  },
});
