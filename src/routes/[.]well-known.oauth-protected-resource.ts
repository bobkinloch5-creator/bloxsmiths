import { createFileRoute } from "@tanstack/react-router";

// RFC 9728 — Protected Resource Metadata
// Tells OAuth-only MCP clients (Claude.ai web/desktop "Add custom connector")
// which authorization server protects this resource.
const ORIGIN = "https://bloxsmith.pro";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export const Route = createFileRoute("/.well-known/oauth-protected-resource")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors }),
      GET: async () =>
        new Response(
          JSON.stringify({
            resource: `${ORIGIN}/api/public/mcp`,
            authorization_servers: [ORIGIN],
            bearer_methods_supported: ["header"],
            resource_documentation: `${ORIGIN}/mcp`,
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
