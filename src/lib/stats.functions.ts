import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { templateFiles } from "./templates";

export const getPublicStats = createServerFn({ method: "GET" }).handler(async () => {
  const [projectsRes, usersRes, showcaseRes, scriptsRes] = await Promise.all([
    supabaseAdmin.from("projects").select("*", { count: "exact", head: true }),
    supabaseAdmin.from("profiles").select("*", { count: "exact", head: true }),
    supabaseAdmin
      .from("projects")
      .select("*", { count: "exact", head: true })
      .eq("showcase_published", true),
    supabaseAdmin.from("project_files").select("*", { count: "exact", head: true }),
  ]);
  return {
    projects: projectsRes.count ?? 0,
    users: usersRes.count ?? 0,
    showcased: showcaseRes.count ?? 0,
    scripts: scriptsRes.count ?? 0,
  };
});

export const ensureStarterProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    // Only auto-create if user has zero projects ever.
    const { count } = await supabase
      .from("projects")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId);
    if ((count ?? 0) > 0) return { created: false, id: null as string | null };

    const { data: project, error } = await supabase
      .from("projects")
      .insert({
        user_id: userId,
        name: "My First Tycoon",
        game_type: "Tycoon",
        description: "A starter project to explore BloxSmith. Chat with the AI to add features!",
        status: "draft",
      })
      .select()
      .single();
    if (error || !project) return { created: false, id: null };

    const files = templateFiles("Tycoon");
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
    return { created: true, id: project.id as string };
  });
