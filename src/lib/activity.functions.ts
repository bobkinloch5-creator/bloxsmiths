import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Helper to get service role client for high-privilege admin operations if needed
function getAdminClient() {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// 1. Log user activity (called by client or server)
export const logUserActivity = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({
      eventType: z.string(),
      description: z.string(),
      path: z.string().optional().nullable(),
      metadata: z.any().optional().nullable(),
      userId: z.string().uuid().optional().nullable(),
    }).parse(input)
  )
  .handler(async ({ data: { eventType, description, path, metadata, userId } }) => {
    const request = getRequest();
    const userAgent = request?.headers?.get("user-agent") || null;
    const ipAddress = request?.headers?.get("x-forwarded-for")?.split(",")[0].trim() || 
                      request?.headers?.get("x-real-ip") || null;

    try {
      const sbAdmin = getAdminClient();
      const { error } = await sbAdmin.from("activity_logs").insert({
        user_id: userId || null,
        event_type: eventType,
        description: description,
        path: path || null,
        metadata: metadata || null,
        user_agent: userAgent,
        ip_address: ipAddress,
      });
      if (error) console.error("Database error logging activity:", error.message);
    } catch (err) {
      console.error("Failed to insert activity log:", err);
    }

    return { ok: true };
  });

// 2. Fetch activity logs (Admin only)
export const getActivityLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    const isAdmin = (roles ?? []).some(
      (r: { role: string }) => r.role === "admin" || r.role === "owner"
    );
    if (!isAdmin) {
      throw new Error("Forbidden");
    }

    const { data, error } = await supabase
      .from("activity_logs")
      .select(`
        id,
        created_at,
        user_id,
        event_type,
        description,
        path,
        metadata,
        ip_address,
        user_agent,
        profiles!activity_logs_user_id_fkey (
          display_name,
          email
        )
      `)
      .order("created_at", { ascending: false })
      .limit(300);

    if (error) {
      if (error.message.includes("does not exist")) return [];
      throw new Error(error.message);
    }
    return data || [];
  });
