import { createFileRoute, useSearch, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { approveOauthAuthorization } from "@/lib/oauth.functions";

type Search = {
  client_id?: string;
  redirect_uri?: string;
  response_type?: string;
  state?: string;
  scope?: string;
  code_challenge?: string;
  code_challenge_method?: string;
  resource?: string;
  client_name?: string;
};

export const Route = createFileRoute("/authorize")({
  component: AuthorizePage,
  validateSearch: (search: Record<string, unknown>): Search => ({
    client_id: typeof search.client_id === "string" ? search.client_id : undefined,
    redirect_uri: typeof search.redirect_uri === "string" ? search.redirect_uri : undefined,
    response_type: typeof search.response_type === "string" ? search.response_type : undefined,
    state: typeof search.state === "string" ? search.state : undefined,
    scope: typeof search.scope === "string" ? search.scope : undefined,
    code_challenge: typeof search.code_challenge === "string" ? search.code_challenge : undefined,
    code_challenge_method:
      typeof search.code_challenge_method === "string" ? search.code_challenge_method : undefined,
    resource: typeof search.resource === "string" ? search.resource : undefined,
    client_name: typeof search.client_name === "string" ? search.client_name : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Authorize MCP Connection — BloxSmith" },
      {
        name: "description",
        content:
          "Approve an MCP client (Claude.ai, Codex, Cursor and others) to connect to your BloxSmith account via OAuth and build Roblox games on your behalf.",
      },
      { property: "og:title", content: "Authorize MCP Connection — BloxSmith" },
      {
        property: "og:description",
        content: "OAuth approval screen for MCP clients connecting to your BloxSmith account.",
      },
      { property: "og:url", content: "https://bloxsmith.pro/authorize" },
    ],
    links: [{ rel: "canonical", href: "https://bloxsmith.pro/authorize" }],
  }),
});

function AuthorizePage() {
  const search = useSearch({ from: "/authorize" });
  const { user, loading } = useAuth();
  const approve = useServerFn(approveOauthAuthorization);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Validate required OAuth params
  const missing: string[] = [];
  if (!search.client_id) missing.push("client_id");
  if (!search.redirect_uri) missing.push("redirect_uri");
  if (search.response_type && search.response_type !== "code") {
    missing.push("response_type=code");
  }

  if (missing.length > 0) {
    return (
      <main className="min-h-screen bg-background text-foreground flex items-center justify-center px-6">
        <div className="max-w-md w-full bg-card border border-border rounded-xl p-8 space-y-4">
          <h1 className="text-2xl font-bold">Invalid authorization request</h1>
          <p className="text-muted-foreground">
            Missing or invalid OAuth parameter(s):{" "}
            <code className="bg-muted px-1.5 py-0.5 rounded">{missing.join(", ")}</code>
          </p>
          <p className="text-sm text-muted-foreground">
            This page is opened by MCP clients (Claude.ai, etc.) when they connect to BloxSmith. You
            don't need to visit it directly.
          </p>
          <Link to="/mcp" className="underline text-sm">
            Back to MCP setup
          </Link>
        </div>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <p className="text-muted-foreground">Loading…</p>
      </main>
    );
  }

  if (!user) {
    const current =
      typeof window !== "undefined"
        ? window.location.pathname + window.location.search
        : "/authorize";
    return (
      <main className="min-h-screen bg-background text-foreground flex items-center justify-center px-6">
        <div className="max-w-md w-full bg-card border border-border rounded-xl p-8 space-y-4">
          <h1 className="text-2xl font-bold">Sign in to authorize</h1>
          <p className="text-muted-foreground">
            <strong>{search.client_name ?? "An MCP client"}</strong> wants to connect to your
            BloxSmith account. Sign in to continue.
          </p>
          <Link to="/login" search={{ redirect: current }} className="block">
            <Button className="w-full">Sign in</Button>
          </Link>
        </div>
      </main>
    );
  }

  const onApprove = async () => {
    setBusy(true);
    setErr(null);
    try {
      const result = await approve({
        data: {
          client_id: search.client_id!,
          redirect_uri: search.redirect_uri!,
          state: search.state,
          scope: search.scope,
          code_challenge: search.code_challenge,
          code_challenge_method: search.code_challenge_method,
          resource: search.resource,
        },
      });
      window.location.href = result.redirectUrl;
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not authorize. Please try again.");
      setBusy(false);
    }
  };

  const onDeny = () => {
    const url = new URL(search.redirect_uri!);
    url.searchParams.set("error", "access_denied");
    if (search.state) url.searchParams.set("state", search.state);
    window.location.href = url.toString();
  };

  return (
    <main className="min-h-screen bg-background text-foreground flex items-center justify-center px-6">
      <div className="max-w-md w-full bg-card border border-border rounded-xl p-8 space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">Connect to BloxSmith</h1>
          <p className="text-muted-foreground">
            <strong>{search.client_name ?? "An MCP client"}</strong> is requesting access to your
            BloxSmith account.
          </p>
        </div>

        <div className="bg-muted/50 rounded-lg p-4 space-y-2 text-sm">
          <p className="font-medium">This will allow it to:</p>
          <ul className="list-disc list-inside text-muted-foreground space-y-1">
            <li>Build and edit your Roblox projects</li>
            <li>Use your BloxSmith account credits</li>
            <li>Read and write project files</li>
          </ul>
        </div>

        <div className="text-xs text-muted-foreground break-all">
          <span className="font-medium">Redirect URL:</span> {search.redirect_uri}
        </div>

        {err && (
          <p className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-md p-3">
            {err}
          </p>
        )}

        <div className="flex gap-3">
          <Button onClick={onDeny} variant="outline" className="flex-1" disabled={busy}>
            Deny
          </Button>
          <Button onClick={onApprove} className="flex-1" disabled={busy}>
            {busy ? "Authorizing…" : "Authorize"}
          </Button>
        </div>

        <p className="text-xs text-muted-foreground text-center">
          Signed in as {user.email}.{" "}
          <Link to="/account" className="underline">
            Account
          </Link>
        </p>
      </div>
    </main>
  );
}
