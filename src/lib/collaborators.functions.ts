import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function assertOwner(supabase: any, userId: string, projectId: string) {
  const { data, error } = await supabase
    .from("projects")
    .select("user_id")
    .eq("id", projectId)
    .maybeSingle();
  if (error || !data) throw new Error("Project not found");
  if (data.user_id !== userId) throw new Error("Only the project owner can manage collaborators");
}

export const listCollaborators = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ projectId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertOwner(supabase, userId, data.projectId);
    return {
      owner: { id: userId, email: "", display_name: "Owner", avatar_url: null },
      isOwner: true,
      collaborators: [],
    };
  });

export const inviteCollaborator = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        email: z.string().email().max(255),
        role: z.enum(["viewer", "editor"]).default("editor"),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    void data;
    void context;
    throw new Error("Project sharing is disabled. Projects are private to their owner.");
  });

export const updateCollaboratorRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        collaboratorId: z.string().uuid(),
        role: z.enum(["viewer", "editor"]),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    void data;
    void context;
    throw new Error("Project sharing is disabled. Projects are private to their owner.");
  });

export const removeCollaborator = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        collaboratorId: z.string().uuid(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    void data;
    void context;
    throw new Error("Project sharing is disabled. Projects are private to their owner.");
  });
