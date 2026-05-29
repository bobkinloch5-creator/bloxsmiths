import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getComfySettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("comfy_settings")
      .select("*")
      .eq("id", 1)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data;
  });

export const updateComfySettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: any) => d as {
    model_choice?: string;
    steps?: number;
    cfg?: number;
    seed?: number;
    width?: number;
    height?: number;
    timeout_seconds?: number;
    use_local_comfy?: boolean;
  })
  .handler(async ({ input, context }) => {
    const { supabase, userId } = context;

    // Check if the user is an admin or owner
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);

    const isAdmin = (roles ?? []).some(
      (r: { role: string }) => r.role === "admin" || r.role === "owner"
    );

    if (!isAdmin) {
      throw new Error("Forbidden");
    }

    const { data, error } = await supabase
      .from("comfy_settings")
      .update(input)
      .eq("id", 1)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  });

export const getJobStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((jobId: string) => jobId)
  .handler(async ({ input: jobId, context }) => {
    const { supabase, userId } = context;

    const { data, error } = await supabase
      .from("comfy_generation_jobs")
      .select("*")
      .eq("id", jobId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) throw new Error("Job not found");

    // Guard access: only the job owner or an admin can access this job status
    if (data.user_id !== userId) {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);

      const isAdmin = (roles ?? []).some(
        (r: { role: string }) => r.role === "admin" || r.role === "owner"
      );

      if (!isAdmin) {
        throw new Error("Forbidden");
      }
    }

    return data;
  });
