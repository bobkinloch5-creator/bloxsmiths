import { createFileRoute } from "@tanstack/react-router";

// RFC 7591 — Dynamic Client Registration
// We don't enforce per-client policy (MCP clients are validated at the
// /authorize approval step by the user). Accept any registration and
// echo back a generated client_id.

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function rand(len = 24) {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export const Route = createFileRoute("/api/public/oauth/register")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors }),
      POST: async ({ request }) => {
        let body: Record<string, unknown> = {};
        try {
          body = await request.json();
        } catch {
          body = {};
        }

        const clientId = "bsmcp_client_" + rand(16);
        const now = Math.floor(Date.now() / 1000);

        return new Response(
          JSON.stringify({
            client_id: clientId,
            client_id_issued_at: now,
            // Public client — no secret
            token_endpoint_auth_method: "none",
            grant_types: ["authorization_code"],
            response_types: ["code"],
            redirect_uris: Array.isArray(body.redirect_uris) ? body.redirect_uris : [],
            client_name: typeof body.client_name === "string" ? body.client_name : "MCP Client",
            scope: "mcp",
          }),
          {
            status: 201,
            headers: { "Content-Type": "application/json", ...cors },
          },
        );
      },
    },
  },
});
