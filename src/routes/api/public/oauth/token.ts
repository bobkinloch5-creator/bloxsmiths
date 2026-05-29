import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// RFC 6749 §4.1.3 + RFC 7636 (PKCE) — Authorization Code exchange
// Issues a `bsoa_…` access token that the MCP server accepts.

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function rand(len = 32) {
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

function b64urlSha256(text: string): Promise<string> {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)).then((buf) => {
    const bytes = new Uint8Array(buf);
    let str = "";
    for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
    return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  });
}

function err(status: number, error: string, description: string) {
  return new Response(JSON.stringify({ error, error_description: description }), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}

export const Route = createFileRoute("/api/public/oauth/token")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors }),
      POST: async ({ request }) => {
        let params: URLSearchParams;
        const ct = request.headers.get("content-type") ?? "";
        try {
          if (ct.includes("application/json")) {
            const body = (await request.json()) as Record<string, string>;
            params = new URLSearchParams(body);
          } else {
            const text = await request.text();
            params = new URLSearchParams(text);
          }
        } catch {
          return err(400, "invalid_request", "Could not parse request body.");
        }

        const grantType = params.get("grant_type");
        if (grantType !== "authorization_code") {
          return err(400, "unsupported_grant_type", "Only authorization_code is supported.");
        }

        const code = params.get("code");
        const redirectUri = params.get("redirect_uri");
        const clientId = params.get("client_id");
        const codeVerifier = params.get("code_verifier");

        if (!code || !redirectUri || !clientId) {
          return err(400, "invalid_request", "Missing code, redirect_uri, or client_id.");
        }

        // Look up and immediately consume (delete) the code.
        const { data: rawRow, error: lookupErr } = await (supabaseAdmin as any)
          .from("oauth_codes")
          .select("*")
          .eq("code", code)
          .maybeSingle();
        const row = rawRow as any;

        if (lookupErr) {
          console.error("[oauth/token] lookup error", lookupErr.message);
          return err(500, "server_error", "Could not validate code.");
        }
        if (!row) {
          return err(400, "invalid_grant", "Authorization code is invalid or already used.");
        }

        // One-time use.
        await (supabaseAdmin as any).from("oauth_codes").delete().eq("code", code);

        if (new Date(row.expires_at as string).getTime() < Date.now()) {
          return err(400, "invalid_grant", "Authorization code expired.");
        }
        if (row.client_id !== clientId) {
          return err(400, "invalid_grant", "client_id mismatch.");
        }
        if (row.redirect_uri !== redirectUri) {
          return err(400, "invalid_grant", "redirect_uri mismatch.");
        }

        // PKCE
        if (row.code_challenge) {
          if (!codeVerifier) {
            return err(400, "invalid_request", "code_verifier required (PKCE).");
          }
          const method = (row.code_challenge_method as string) ?? "plain";
          let computed: string;
          if (method === "S256") {
            computed = await b64urlSha256(codeVerifier);
          } else {
            computed = codeVerifier;
          }
          if (computed !== row.code_challenge) {
            return err(400, "invalid_grant", "PKCE verification failed.");
          }
        }

        // Issue access token.
        const token = "bsoa_" + rand(32);
        const tokenHash = await sha256(token);

        const { error: insertErr } = await (supabaseAdmin as any).from("oauth_access_tokens").insert({
          token_hash: tokenHash,
          user_id: row.user_id as string,
          client_id: row.client_id as string,
          scope: (row.scope as string) ?? "mcp",
          expires_at: null, // long-lived; revocable per user
        });
        if (insertErr) {
          console.error("[oauth/token] token insert error", insertErr.message);
          return err(500, "server_error", "Could not issue token.");
        }

        console.log(
          `[oauth/token] issued access token for user=${row.user_id} client=${row.client_id}`,
        );

        return new Response(
          JSON.stringify({
            access_token: token,
            token_type: "Bearer",
            scope: (row.scope as string) ?? "mcp",
          }),
          { status: 200, headers: { "Content-Type": "application/json", ...cors } },
        );
      },
    },
  },
});
