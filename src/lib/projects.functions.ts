import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { templateFiles } from "./templates";

export const createProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        name: z.string().min(1).max(120),
        game_type: z.string().min(1).max(60),
        template: z.string().min(1).max(60),
        description: z.string().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: project, error } = await supabase
      .from("projects")
      .insert({
        user_id: userId,
        name: data.name,
        game_type: data.game_type,
        description: data.description ?? null,
        status: "draft",
      })
      .select()
      .single();
    if (error || !project) throw new Error(error?.message ?? "Failed to create project");

    const files = templateFiles(data.template);
    if (files.length > 0) {
      await supabase.from("project_files").insert(
        files.map((f) => ({
          project_id: project.id,
          path: f.path,
          file_type: f.file_type,
          service_location: f.service_location,
          content: f.content,
        })),
      );
    }
    return { id: project.id };
  });

function randomToken(len = 40) {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256(text: string) {
  const buf = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export const generatePluginToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const token = "bs_" + randomToken(32);
    const hash = await sha256(token);
    const { error } = await supabase
      .from("plugin_tokens")
      .upsert(
        { user_id: userId, token_hash: hash, updated_at: new Date().toISOString() },
        { onConflict: "user_id" },
      );
    if (error) throw new Error(error.message);
    return { token };
  });

export const inviteCollaborator = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        email: z.string().email(),
        role: z.enum(["editor", "viewer"]).default("editor"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    void data;
    void context;
    throw new Error("Project sharing is disabled. Projects are private to their owner.");
  });
