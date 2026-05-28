import { createFileRoute, Link } from "@tanstack/react-router";
import { McpTokenManager } from "@/components/McpTokenManager";
import { MCP_PROTOCOL_VERSION } from "@/lib/mcp-rpc-utils";

export const Route = createFileRoute("/mcp")({
  component: McpPage,
  head: () => ({
    meta: [
      { title: "BloxSmith MCP — Connect any AI to Roblox Studio" },
      {
        name: "description",
        content:
          "Connect Claude Code, ChatGPT Codex, Antigravity, or any MCP-compatible AI to BloxSmith and build Roblox games using your account credits.",
      },
      { property: "og:title", content: "BloxSmith MCP — Connect any AI to Roblox Studio" },
      {
        property: "og:description",
        content:
          "Use Claude, Codex, Cursor, or Antigravity to build Roblox games through the BloxSmith MCP server.",
      },
      { property: "og:url", content: "https://bloxsmith.pro/mcp" },
      { property: "og:type", content: "website" },
      { name: "twitter:title", content: "BloxSmith MCP — Connect any AI to Roblox Studio" },
      {
        name: "twitter:description",
        content:
          "Use Claude, Codex, Cursor, or Antigravity to build Roblox games through the BloxSmith MCP server.",
      },
    ],
    links: [{ rel: "canonical", href: "https://bloxsmith.pro/mcp" }],
  }),
});

function Code({ children }: { children: React.ReactNode }) {
  return (
    <pre className="bg-muted text-foreground rounded-lg p-4 overflow-x-auto text-sm border border-border">
      <code>{children}</code>
    </pre>
  );
}

function McpPage() {
  const endpoint = "https://bloxsmith.pro/api/public/mcp";
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-6 py-16 space-y-10">
        <header className="space-y-3">
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
            ← Back
          </Link>
          <h1 className="text-4xl font-bold tracking-tight">Connect BloxSmith to your AI</h1>
          <p className="text-lg text-muted-foreground">
            Use Claude Code, ChatGPT Codex, Google Antigravity, Cursor, or any other MCP-compatible
            client to build Roblox games inside your BloxSmith projects.
          </p>
          <p className="text-sm">
            Want it the other way around?{" "}
            <Link to="/mcp-servers" className="underline font-medium">
              Connect your own MCP servers
            </Link>{" "}
            (Notion, Linear, GitHub, custom…) so the BloxSmith AI can use their tools while
            building.
          </p>
          <p className="text-sm">
            Need help or want to share what you're building?{" "}
            <a
              href="https://discord.gg/J9TU7syJCr"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-medium"
            >
              Join the BloxSmith Discord
            </a>
            .
          </p>
        </header>

        <section className="space-y-4 rounded-2xl border border-primary/30 bg-primary/5 p-6">
          <h2 className="text-2xl font-semibold">How it works (3 steps)</h2>
          <ol className="list-decimal list-inside text-muted-foreground space-y-2">
            <li>
              <strong className="text-foreground">Generate your token</strong> below and copy it.
              Keep it secret — it spends your credits.
            </li>
            <li>
              <strong className="text-foreground">Add BloxSmith as an MCP server</strong> in your AI
              client (Claude Code, Codex, Antigravity, VS Code, Cursor, Windsurf, or anything else
              that speaks MCP).
            </li>
            <li>
              <strong className="text-foreground">Prompt your AI</strong> to call{" "}
              <code className="bg-muted px-1.5 py-0.5 rounded">list_my_projects</code> then{" "}
              <code className="bg-muted px-1.5 py-0.5 rounded">build_roblox</code>. That's it — your
              Studio plugin applies the changes.
            </li>
          </ol>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">Endpoint</h2>
          <Code>{endpoint}</Code>
          <p className="text-sm text-muted-foreground">
            Standard <strong>MCP Streamable HTTP</strong> transport — works with any MCP-compatible
            client. Authenticate with{" "}
            <code className="bg-muted px-1.5 py-0.5 rounded">
              Authorization: Bearer &lt;YOUR_MCP_TOKEN&gt;
            </code>
            . Generate, rotate, or revoke your personal token below — if it ever leaks, click{" "}
            <strong>Revoke</strong> to kill it instantly.
          </p>
        </section>

        <McpTokenManager />

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">Pricing</h2>
          <p className="text-muted-foreground">
            Each <code className="bg-muted px-1.5 py-0.5 rounded">build_roblox</code> call costs{" "}
            <strong>1 BloxSmith credit</strong> from the connected MCP user's account — the same as
            a build run from the website. Read-only tools (
            <code className="bg-muted px-1.5 py-0.5 rounded">list_my_projects</code>,{" "}
            <code className="bg-muted px-1.5 py-0.5 rounded">list_project_files</code>,{" "}
            <code className="bg-muted px-1.5 py-0.5 rounded">read_project_file</code>,{" "}
            <code className="bg-muted px-1.5 py-0.5 rounded">search_roblox_toolbox</code>) are free.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">Claude.ai (web & desktop app)</h2>
          <p className="text-muted-foreground">
            In Claude, open <strong>Settings → Connectors → Add custom connector</strong> and fill
            in:
          </p>
          <ul className="list-disc list-inside text-muted-foreground space-y-1">
            <li>
              <strong>Name:</strong>{" "}
              <code className="bg-muted px-1.5 py-0.5 rounded">BloxSmith</code>
            </li>
            <li>
              <strong>Remote MCP server URL:</strong>{" "}
              <code className="bg-muted px-1.5 py-0.5 rounded">{endpoint}</code>
            </li>
          </ul>
          <p className="text-muted-foreground">
            Click <strong>Add</strong>. Claude will open a BloxSmith authorization page — sign in
            (if you aren't already) and click <strong>Authorize</strong>. You'll be redirected back
            to Claude and BloxSmith tools will be available in any new chat.
          </p>
          <p className="text-sm text-muted-foreground">
            No token needed — authorization is handled via OAuth. You can revoke access any time
            from Claude's connector settings.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">Claude Code</h2>
          <p className="text-muted-foreground">
            Add to <code className="bg-muted px-1.5 py-0.5 rounded">~/.claude.json</code> or run{" "}
            <code className="bg-muted px-1.5 py-0.5 rounded">claude mcp add</code>:
          </p>
          <Code>{`{
  "mcpServers": {
    "bloxsmith": {
      "type": "http",
      "url": "${endpoint}",
      "headers": { "Authorization": "Bearer YOUR_MCP_TOKEN" }
    }
  }
}`}</Code>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">ChatGPT Codex CLI</h2>
          <p className="text-muted-foreground">
            Add to <code className="bg-muted px-1.5 py-0.5 rounded">~/.codex/config.toml</code>:
          </p>
          <Code>{`[mcp_servers.bloxsmith]
type    = "http"
url     = "${endpoint}"
headers = { Authorization = "Bearer YOUR_MCP_TOKEN" }`}</Code>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">Google Antigravity</h2>
          <ol className="list-decimal list-inside text-muted-foreground space-y-1">
            <li>Open Settings → MCP Servers → Add Server.</li>
            <li>
              Transport: <strong>Streamable HTTP</strong>.
            </li>
            <li>
              URL: <code className="bg-muted px-1.5 py-0.5 rounded">{endpoint}</code>
            </li>
            <li>
              Add header <code className="bg-muted px-1.5 py-0.5 rounded">Authorization</code> ={" "}
              <code className="bg-muted px-1.5 py-0.5 rounded">Bearer YOUR_MCP_TOKEN</code>.
            </li>
          </ol>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">VS Code (GitHub Copilot Chat)</h2>
          <p className="text-muted-foreground">
            VS Code 1.99+ supports MCP servers in Copilot Chat agent mode. Create{" "}
            <code className="bg-muted px-1.5 py-0.5 rounded">.vscode/mcp.json</code> in your
            workspace (or add it to user settings):
          </p>
          <Code>{`{
  "servers": {
    "bloxsmith": {
      "type": "http",
      "url": "${endpoint}",
      "headers": { "Authorization": "Bearer YOUR_MCP_TOKEN" }
    }
  }
}`}</Code>
          <p className="text-sm text-muted-foreground">
            Then open Copilot Chat → switch to <strong>Agent</strong> mode → click the tools icon
            and enable <strong>bloxsmith</strong>.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">Cursor / Windsurf / Zed / Continue</h2>
          <p className="text-muted-foreground">
            Most editors use the same JSON shape. Add to their MCP settings file:
          </p>
          <Code>{`{
  "mcpServers": {
    "bloxsmith": {
      "url": "${endpoint}",
      "headers": { "Authorization": "Bearer YOUR_MCP_TOKEN" }
    }
  }
}`}</Code>
          <p className="text-sm text-muted-foreground">
            Some IDE builds still expect a local stdio bridge instead of direct HTTP. If the direct
            URL does not connect, use this command-based server:
          </p>
          <Code>{`{
  "mcpServers": {
    "bloxsmith": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "${endpoint}",
        "--header",
        "Authorization: Bearer YOUR_MCP_TOKEN"
      ]
    }
  }
}`}</Code>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">Any other MCP client</h2>
          <p className="text-muted-foreground">
            BloxSmith implements the standard MCP <strong>Streamable HTTP</strong> transport. If
            your client supports it, point it at the endpoint above with the{" "}
            <code className="bg-muted px-1.5 py-0.5 rounded">Authorization</code> header. To verify
            the connection from a terminal:
          </p>
          <Code>{`curl -X POST ${endpoint} \\
  -H "Authorization: Bearer YOUR_MCP_TOKEN" \\
  -H "Content-Type: application/json" \\
  -H "Accept: application/json, text/event-stream" \\
  -H "MCP-Protocol-Version: ${MCP_PROTOCOL_VERSION}" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`}</Code>
          <p className="text-sm text-muted-foreground">
            A successful response lists <code>list_my_projects</code>, <code>build_roblox</code>,
            and the other tools below.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">Available tools</h2>
          <ul className="text-muted-foreground space-y-2">
            <li>
              <strong>list_my_projects</strong> — find a projectId. <em>Free.</em>
            </li>
            <li>
              <strong>build_roblox</strong> — natural-language game building. Writes scripts and
              queues plugin actions for your Studio plugin to apply. <em>1 credit per call.</em>
            </li>
            <li>
              <strong>list_project_files</strong> / <strong>read_project_file</strong> — inspect
              existing code. <em>Free.</em>
            </li>
            <li>
              <strong>search_roblox_toolbox</strong> — find free Roblox toolbox assets.{" "}
              <em>Free.</em>
            </li>
            <li>
              <strong>search_roblox_docs</strong> — search official Roblox Creator Hub and Engine
              API docs. <em>Free.</em>
            </li>
            <li>
              <strong>mcp_connection_help</strong> — get setup snippets for your IDE. <em>Free.</em>
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">Example prompt</h2>
          <Code>{`Use bloxsmith. Call list_my_projects, then call build_roblox on the
top project with: "Add a sword combat system with M1/M2 attacks,
hit VFX, and a leaderboard for KOs."`}</Code>
        </section>
      </div>
    </main>
  );
}
