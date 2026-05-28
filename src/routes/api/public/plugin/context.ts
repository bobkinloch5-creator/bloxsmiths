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

// Receives a live snapshot of the user's Studio workspace from the plugin.
// The AI reads the latest snapshot before generating actions so it has full awareness.
export const Route = createFileRoute("/api/public/plugin/context")({
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

        const body = await request.json().catch(() => ({}) as any);
        const projectId = body?.projectId;
        const ctx = body?.context;
        if (!projectId || !ctx) {
          return new Response(JSON.stringify({ error: "missing projectId or context" }), {
            status: 400,
            headers: cors,
          });
        }

        const { data: project } = await supabaseAdmin
          .from("projects")
          .select("id,user_id")
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

        const instanceCount = typeof ctx?.instanceCount === "number" ? ctx.instanceCount : 0;

        // Hard cap payload size to keep DB rows + AI prompt sane without
        // slicing JSON into an invalid document.
        const serialized = JSON.stringify(ctx);
        const safeCtx =
          serialized.length > 200_000
            ? {
                projectName: ctx?.projectName ?? ctx?.placeName ?? "Roblox Studio Project",
                placeId: ctx?.placeId ?? null,
                placeName: ctx?.placeName ?? null,
                scannedAt: ctx?.scannedAt ?? new Date().toISOString(),
                instanceCount,
                truncated: true,
                tree: Array.isArray(ctx?.tree) ? ctx.tree.slice(0, 20) : [],
                note: "Studio context was too large, so BloxSmith stored a truncated manifest. Use Sync Project Now to refresh after narrowing the project.",
              }
            : ctx;

        await supabaseAdmin.from("plugin_context").upsert(
          {
            project_id: projectId,
            user_id: userId,
            context: safeCtx,
            instance_count: instanceCount,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "project_id" },
        );

        return new Response(JSON.stringify({ ok: true }), { headers: cors });
      },
    },
  },
});
