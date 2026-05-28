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

export const Route = createFileRoute("/api/public/plugin/auth")({
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
        const { data: tokenRow } = await supabaseAdmin
          .from("plugin_tokens")
          .select("user_id")
          .eq("token_hash", hash)
          .maybeSingle();
        if (!tokenRow)
          return new Response(JSON.stringify({ error: "invalid token" }), {
            status: 401,
            headers: cors,
          });
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("id,email,display_name,credits")
          .eq("id", tokenRow.user_id)
          .maybeSingle();
        if (!profile)
          return new Response(JSON.stringify({ error: "invalid token" }), {
            status: 401,
            headers: cors,
          });

        // Fetch only projects owned by this token's user. Project data is private per account.
        const { data: ownedProjects } = await supabaseAdmin
          .from("projects")
          .select("id,name,game_type,updated_at")
          .eq("user_id", profile.id)
          .order("updated_at", { ascending: false });
        const projects = ownedProjects ?? [];

        const { data: existing } = await supabaseAdmin
          .from("plugin_connections")
          .select("id")
          .eq("token_hash", hash)
          .maybeSingle();
        if (existing) {
          await supabaseAdmin
            .from("plugin_connections")
            .update({ status: "active", last_connected_at: new Date().toISOString() })
            .eq("id", existing.id);
        } else {
          await supabaseAdmin.from("plugin_connections").insert({
            user_id: profile.id,
            token_hash: hash,
            status: "active",
            last_connected_at: new Date().toISOString(),
          });
        }
        return new Response(JSON.stringify({ user: profile, projects: projects ?? [] }), {
          headers: cors,
        });
      },
    },
  },
});
