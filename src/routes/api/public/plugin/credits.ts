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

export const Route = createFileRoute("/api/public/plugin/credits")({
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
          .select("credits,display_name,email")
          .eq("id", tokenRow.user_id)
          .maybeSingle();
        if (!profile)
          return new Response(JSON.stringify({ error: "invalid token" }), {
            status: 401,
            headers: cors,
          });
        return new Response(
          JSON.stringify({
            credits: profile.credits,
            display_name: profile.display_name,
            email: profile.email,
          }),
          { headers: cors },
        );
      },
    },
  },
});
