import { createFileRoute } from "@tanstack/react-router";

// RFC 8414 — Authorization Server Metadata
const ORIGIN = "https://bloxsmith.pro";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export const Route = createFileRoute("/.well-known/oauth-authorization-server")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors }),
      GET: async () =>
        new Response(
          JSON.stringify({
            issuer: ORIGIN,
            authorization_endpoint: `${ORIGIN}/authorize`,
            token_endpoint: `${ORIGIN}/api/public/oauth/token`,
            registration_endpoint: `${ORIGIN}/api/public/oauth/register`,
            response_types_supported: ["code"],
            grant_types_supported: ["authorization_code"],
            code_challenge_methods_supported: ["S256", "plain"],
            token_endpoint_auth_methods_supported: ["none"],
            scopes_supported: ["mcp"],
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Cache-Control": "public, max-age=3600",
              ...cors,
            },
          },
        ),
    },
  },
});
