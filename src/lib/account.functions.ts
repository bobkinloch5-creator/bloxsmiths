import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const deleteOwnAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    // Cleanup user-owned rows (no FK cascades on these tables)
    await supabaseAdmin
      .from("project_files")
      .delete()
      .in(
        "project_id",
        (await supabaseAdmin.from("projects").select("id").eq("user_id", userId)).data?.map(
          (p) => p.id,
        ) ?? ["00000000-0000-0000-0000-000000000000"],
      );
    await supabaseAdmin.from("project_collaborators").delete().eq("user_id", userId);
    await supabaseAdmin.from("projects").delete().eq("user_id", userId);
    await supabaseAdmin.from("plugin_connections").delete().eq("user_id", userId);
    await supabaseAdmin.from("studio_errors").delete().eq("user_id", userId);
    await supabaseAdmin.from("credit_transactions").delete().eq("user_id", userId);
    await supabaseAdmin.from("payment_requests").delete().eq("user_id", userId);
    await supabaseAdmin.from("payments").delete().eq("user_id", userId);
    await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
    await supabaseAdmin.from("profiles").delete().eq("id", userId);
    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
