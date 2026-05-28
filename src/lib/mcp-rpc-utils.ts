export const MCP_PROTOCOL_VERSION = "2025-06-18";

export function mcpHttpHeaders(authHeader?: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    "MCP-Protocol-Version": MCP_PROTOCOL_VERSION,
    ...(authHeader ? { Authorization: authHeader } : {}),
  };
}

export function normalizeMcpAuthHeader(raw: string | null | undefined): string {
  const value = (raw ?? "").trim();
  if (!value) return "";
  if (/^(Bearer|Basic|Token)\s+/i.test(value)) return value;
  return `Bearer ${value}`;
}

export function isOwnMcpUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    const path = u.pathname.replace(/\/+$/, "");
    const isOurs =
      host === "bloxsmith.pro" ||
      host === "www.bloxsmith.pro" ||
      host.endsWith(".lovable.app") ||
      host === "localhost" ||
      host === "127.0.0.1";
    return isOurs && path === "/api/public/mcp";
  } catch {
    return false;
  }
}

export async function parseMcpHttpResponse(response: Response): Promise<any> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/event-stream")) {
    return response.json();
  }

  const text = await response.text();
  const events = text
    .split(/\n\n+/)
    .map((block) =>
      block
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .join("\n"),
    )
    .filter(Boolean);

  for (const event of events) {
    try {
      const parsed = JSON.parse(event);
      if (parsed?.id !== undefined || parsed?.result !== undefined || parsed?.error !== undefined) {
        return parsed;
      }
    } catch {
      // Keep scanning; some SSE streams include comments or non-JSON pings.
    }
  }

  throw new Error("Empty MCP SSE response");
}
