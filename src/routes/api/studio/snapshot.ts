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

export const Route = createFileRoute("/api/studio/snapshot")({
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
          const incomingFiles = body?.files;

          if (!projectId || !Array.isArray(incomingFiles)) {
            return new Response(JSON.stringify({ error: "missing projectId or files" }), {
              status: 400,
              headers: cors,
            });
          }

          // Verify ownership. Projects are private per account.
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

          // Fetch current project files
          const { data: currentFiles } = await supabaseAdmin
            .from("project_files")
            .select("id,path,content")
            .eq("project_id", projectId);

          const currentMap = new Map((currentFiles ?? []).map((f) => [f.path, f]));
          const incomingPaths = new Set(incomingFiles.map((f) => f.path));

          // Perform updates and insertions
          for (const file of incomingFiles) {
            if (!file.path) continue;
            const content = file.source ?? "";
            const fileType = file.className ?? "Folder";
            const serviceLocation = file.parent ?? file.path.split("/")[0] ?? "Workspace";

            const existing = currentMap.get(file.path);
            if (existing) {
              if (existing.content !== content) {
                await supabaseAdmin
                  .from("project_files")
                  .update({
                    content,
                    file_type: fileType,
                    service_location: serviceLocation,
                    updated_at: new Date().toISOString(),
                  })
                  .eq("id", existing.id);
              }
            } else {
              await supabaseAdmin.from("project_files").insert({
                project_id: projectId,
                path: file.path,
                file_type: fileType,
                service_location: serviceLocation,
                content,
              });
            }
          }

          // Clean up files that no longer exist in the incoming list
          const pathsToDelete = (currentFiles ?? [])
            .filter((f) => !incomingPaths.has(f.path))
            .map((f) => f.id);

          if (pathsToDelete.length > 0) {
            await supabaseAdmin.from("project_files").delete().in("id", pathsToDelete);
          }

          return new Response(JSON.stringify({ ok: true }), { headers: cors });
        } catch (e: any) {
          console.error("API error in studio/snapshot:", e);
          return new Response(JSON.stringify({ error: "Internal server error" }), {
            status: 500,
            headers: cors,
          });
        }
      },
    },
  },
});
