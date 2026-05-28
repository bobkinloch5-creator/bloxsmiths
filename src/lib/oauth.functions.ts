import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function rand(len = 32) {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export type ApproveInput = {
  client_id: string;
  redirect_uri: string;
  state?: string;
  scope?: string;
  code_challenge?: string;
  code_challenge_method?: string;
  resource?: string;
};

/**
 * Creates a one-time authorization code for the current logged-in user
 * and returns the full redirect URL (code + state appended).
 */
export const approveOauthAuthorization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: ApproveInput) => {
    if (!input || typeof input !== "object") throw new Error("Invalid input");
    if (typeof input.client_id !== "string" || !input.client_id) {
      throw new Error("client_id required");
    }
    if (typeof input.redirect_uri !== "string" || !/^https?:\/\//.test(input.redirect_uri)) {
      throw new Error("Valid redirect_uri required");
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const code = "bsac_" + rand(24);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const { error } = await supabaseAdmin.from("oauth_codes").insert({
      code,
      user_id: userId,
      client_id: data.client_id,
      redirect_uri: data.redirect_uri,
      code_challenge: data.code_challenge ?? null,
      code_challenge_method: data.code_challenge_method ?? null,
      scope: data.scope ?? "mcp",
      resource: data.resource ?? null,
      expires_at: expiresAt,
    });
    if (error) throw new Error(`Could not create authorization code: ${error.message}`);

    const url = new URL(data.redirect_uri);
    url.searchParams.set("code", code);
    if (data.state) url.searchParams.set("state", data.state);

    console.log(
      `[oauth/approve] code issued user=${userId} client=${data.client_id} redirect=${data.redirect_uri}`,
    );

    return { redirectUrl: url.toString() };
  });
