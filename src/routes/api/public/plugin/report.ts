import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Plugin posts here after dispatching actions so the web UI can show
// real execution status instead of just "delivered".
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

type Report = {
  id: string;
  status: "executed" | "failed";
  error?: string | null;
};

export const Route = createFileRoute("/api/public/plugin/report")({
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
        const body = (await request.json().catch(() => ({}))) as { reports?: Report[] };
        const reports = Array.isArray(body?.reports) ? body.reports : [];
        if (reports.length === 0) {
          return new Response(JSON.stringify({ ok: true, updated: 0 }), { headers: cors });
        }

        let updated = 0;
        const now = new Date().toISOString();
        for (const r of reports) {
          if (!r?.id || (r.status !== "executed" && r.status !== "failed")) continue;

          const { data: action } = await supabaseAdmin
            .from("plugin_actions")
            .select("project_id")
            .eq("id", r.id)
            .maybeSingle();

          if (!action) continue;

          const { data: project } = await supabaseAdmin
            .from("projects")
            .select("id,user_id")
            .eq("id", action.project_id)
            .maybeSingle();

          if (!project) continue;

          if (project.user_id !== userId) continue;

          const { error } = await supabaseAdmin
            .from("plugin_actions")
            .update({
              status: r.status,
              executed_at: now,
              error_message: r.status === "failed" ? (r.error ?? "execution failed") : null,
            })
            .eq("id", r.id);
          if (!error) updated++;
        }
        return new Response(JSON.stringify({ ok: true, updated }), { headers: cors });
      },
    },
  },
});
