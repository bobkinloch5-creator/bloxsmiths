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

export const Route = createFileRoute("/api/public/plugin/errors")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors }),
      POST: async ({ request }) => {
        const token = request.headers.get("x-plugin-token");
        if (!token)
          return new Response(JSON.stringify({ error: "missing token" }), {
            status: 401,
            headers: cors,
          });
        const hash = await sha256(token);
        const { data: profile } = await supabaseAdmin
          .from("plugin_tokens")
          .select("user_id")
          .eq("token_hash", hash)
          .maybeSingle();
        if (!profile)
          return new Response(JSON.stringify({ error: "invalid token" }), {
            status: 401,
            headers: cors,
          });
        const body = await request.json().catch(() => ({}));
        const errs: Array<{ projectId?: string; file_path?: string; error_message: string }> =
          body?.errors ?? [];
        if (!Array.isArray(errs) || errs.length === 0)
          return new Response(JSON.stringify({ ok: true }), { headers: cors });
        const sliced = errs.slice(0, 50);
        // Validate any provided project_id belongs to this user
        const requestedIds = Array.from(
          new Set(
            sliced
              .map((e) => e.projectId)
              .filter((x): x is string => typeof x === "string" && x.length > 0),
          ),
        );
        const allowed = new Set<string>();
        if (requestedIds.length > 0) {
          const { data: ownProjects } = await supabaseAdmin
            .from("projects")
            .select("id")
            .eq("user_id", profile.user_id)
            .in("id", requestedIds);
          (ownProjects ?? []).forEach((p: { id: string }) => allowed.add(p.id));
        }
        await (supabaseAdmin as any).from("studio_errors").insert(
          sliced.map((e) => ({
            user_id: profile.user_id,
            project_id: e.projectId && allowed.has(e.projectId) ? e.projectId : null,
            file_path: typeof e.file_path === "string" ? e.file_path.slice(0, 500) : null,
            error_message: String(e.error_message ?? "").slice(0, 2000),
          })),
        );
        return new Response(JSON.stringify({ ok: true, count: sliced.length }), { headers: cors });
      },
    },
  },
});
