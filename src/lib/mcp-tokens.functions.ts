import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function randomToken(len = 32) {
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

/** Returns connection status without ever returning the plaintext token. */
export const getMcpTokenStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = context.supabase as any;
    const { userId } = context;
    const { data } = await supabase
      .from("mcp_tokens")
      .select(
        "created_at,updated_at,last_used_at,last_attempt_at,last_attempt_ok,last_attempt_error,last_client,last_user_agent",
      )
      .eq("user_id", userId)
      .maybeSingle();
    return {
      hasToken: !!data,
      createdAt: data?.created_at ?? null,
      updatedAt: data?.updated_at ?? null,
      lastUsedAt: data?.last_used_at ?? null,
      lastAttemptAt: data?.last_attempt_at ?? null,
      lastAttemptOk: data?.last_attempt_ok ?? null,
      lastAttemptError: data?.last_attempt_error ?? null,
      lastClient: (data as any)?.last_client ?? null,
      lastUserAgent: (data as any)?.last_user_agent ?? null,
    };
  });

/** Generates a new token, replacing any existing one. Returns plaintext once. */
export const generateMcpToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = context.supabase as any;
    const { userId } = context;
    const token = "bsmcp_" + randomToken(32);
    const hash = await sha256(token);
    const { error } = await supabase.from("mcp_tokens").upsert(
      {
        user_id: userId,
        token_hash: hash,
        last_used_at: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (error) throw new Error(error.message);
    return { token };
  });

/** Revokes the user's MCP token. */
export const revokeMcpToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = context.supabase as any;
    const { userId } = context;
    const { error } = await supabase.from("mcp_tokens").delete().eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
