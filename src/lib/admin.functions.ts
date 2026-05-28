import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const requireAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);

    const isAdmin = (roles ?? []).some(
      (r: { role: string }) => r.role === "admin" || r.role === "owner",
    );

    if (!isAdmin) {
      throw new Error("Forbidden");
    }

    return { isAdmin: true };
  });
