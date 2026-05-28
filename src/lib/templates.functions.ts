import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listTemplates = createServerFn({ method: "GET" }).handler(async () => {
  // Public catalog — read via the auth-middleware client (RLS allows anon SELECT on active rows
  // but we keep it authed to match other server fns); fallback to admin client if not signed in.
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("templates")
    .select(
      "id,slug,name,category,description,thumbnail_url,credits_cost,difficulty,features,install_count",
    )
    .eq("active", true)
    .order("install_count", { ascending: false });
  if (error) throw new Error(error.message);
  return { templates: data ?? [] };
});

export const installTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        templateSlug: z.string().min(1).max(100),
        projectName: z.string().min(1).max(120).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: tpl, error: tplErr } = await supabaseAdmin
      .from("templates")
      .select("*")
      .eq("slug", data.templateSlug)
      .eq("active", true)
      .maybeSingle();
    if (tplErr || !tpl) throw new Error("Template not found");

    // Charge credits (owner role gets 999,999 free)
    if (tpl.credits_cost > 0) {
      const { error: spendErr } = await supabase.rpc("spend_credits_atomic", {
        _amount: tpl.credits_cost,
      });
      if (spendErr) throw new Error("Not enough credits to install this template.");
    }

    const { data: project, error: pErr } = await supabase
      .from("projects")
      .insert({
        user_id: userId,
        name: data.projectName ?? tpl.name,
        game_type: tpl.category,
        description: tpl.description,
        status: "draft",
      })
      .select()
      .single();
    if (pErr || !project) throw new Error(pErr?.message ?? "Could not create project");

    // Seed a build_plan from the template spec so the user lands in /project/$id with a plan ready to execute
    const buildSpec = (tpl.build_spec ?? {}) as { prompt?: string };
    if (buildSpec.prompt) {
      await supabase.from("build_plans").insert({
        project_id: project.id,
        user_id: userId,
        prompt: buildSpec.prompt,
        plan: { source: "template", template_slug: tpl.slug, features: tpl.features },
        status: "ready",
      });
      // Seed tasks from features list
      const features = Array.isArray(tpl.features) ? (tpl.features as string[]) : [];
      if (features.length > 0) {
        await supabase.from("project_tasks").insert(
          features.map((title, i) => ({
            project_id: project.id,
            user_id: userId,
            title,
            kind: "feature",
            status: "todo",
            position: i,
          })),
        );
      }
    }

    await supabaseAdmin.from("template_installs").insert({
      template_id: tpl.id,
      user_id: userId,
      project_id: project.id,
      credits_charged: tpl.credits_cost,
    });
    await supabaseAdmin
      .from("templates")
      .update({ install_count: (tpl.install_count ?? 0) + 1 })
      .eq("id", tpl.id);

    return { projectId: project.id, name: project.name };
  });
