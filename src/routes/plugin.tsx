import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Header, Footer } from "@/components/layout";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { generatePluginToken } from "@/lib/projects.functions";
import { toast } from "sonner";
import {
  ArrowRight,
  Check,
  Copy,
  Download,
  Eye,
  EyeOff,
  KeyRound,
  Laptop,
  Loader2,
  Lock,
  Plug,
  RefreshCw,
  Rocket,
  ShieldCheck,
  Wifi,
} from "lucide-react";

import pluginSource from "../../plugin-src/BloxSmith.server.lua?raw";
import { AutoPluginInstaller } from "@/components/AutoPluginInstaller";

const PLUGIN_DOWNLOAD_URL = "/BloxSmith.lua";
const PLUGIN_VERSION = "latest";

export const Route = createFileRoute("/plugin")({
  component: PluginWizard,
  head: () => ({
    meta: [
      { title: "Plugin Setup — BloxSmith" },
      {
        name: "description",
        content:
          "Step-by-step wizard to link your BloxSmith account to Roblox Studio and securely sync your projects.",
      },
      { property: "og:title", content: "Plugin Setup — BloxSmith" },
      {
        property: "og:description",
        content:
          "Install the BloxSmith Roblox Studio plugin and connect it to your account in under a minute.",
      },
      { property: "og:url", content: "https://bloxsmith.pro/plugin" },
    ],
    links: [{ rel: "canonical", href: "https://bloxsmith.pro/plugin" }],
  }),
});

type Step = {
  id: string;
  title: string;
  subtitle: string;
  icon: typeof Plug;
};

const STEPS: Step[] = [
  { id: "account", title: "Sign in", subtitle: "Link your BloxSmith account", icon: Lock },
  {
    id: "install",
    title: "Install plugin",
    subtitle: "Get BloxSmith AI from Roblox",
    icon: Download,
  },
  { id: "http", title: "Allow HTTP", subtitle: "Let Studio talk to BloxSmith", icon: Wifi },
  { id: "token", title: "Generate token", subtitle: "Your private connection key", icon: KeyRound },
  {
    id: "verify",
    title: "Verify connection",
    subtitle: "Make sure Studio is talking",
    icon: ShieldCheck,
  },
  { id: "project", title: "Pick a project", subtitle: "Start syncing into Studio", icon: Rocket },
];

type ProjectRow = { id: string; name: string; game_type: string; updated_at: string };

function PluginWizard() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const runGenToken = useServerFn(generatePluginToken);

  const [step, setStep] = useState(0);
  const [installed, setInstalled] = useState(false);
  const [httpEnabled, setHttpEnabled] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [showToken, setShowToken] = useState(false);

  const [genBusy, setGenBusy] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);
  const [studioMeta, setStudioMeta] = useState<{ last_connected_at: string | null } | null>(null);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const verifyTimer = useRef<number | null>(null);

  // Load projects once signed in
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("projects")
        .select("id,name,game_type,updated_at")
        .order("updated_at", { ascending: false });
      setProjects((data ?? []) as ProjectRow[]);
    })();
  }, [user]);

  // Auto-advance from "Sign in" once logged in
  useEffect(() => {
    if (user && step === 0) setStep(1);
  }, [user, step]);

  const generate = async () => {
    if (genBusy) return;
    setGenBusy(true);
    try {
      const { token: t } = await runGenToken({});
      setToken(t);
      setShowToken(false);

      setVerified(false);
      toast.success("New plugin token generated");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to generate token");
    } finally {
      setGenBusy(false);
    }
  };

  const copy = async () => {
    if (!token) return;
    await navigator.clipboard.writeText(token);
    toast.success("Token copied");
  };

  // Poll plugin_connections for an active session from Studio
  const startVerify = () => {
    if (!user) return;
    setVerifying(true);
    setVerified(false);
    let tries = 0;
    const tick = async () => {
      tries++;
      const { data } = await supabase
        .from("plugin_connections")
        .select("status,last_connected_at,studio_metadata")
        .eq("user_id", user.id)
        .eq("status", "active")
        .order("last_connected_at", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();
      const last = data?.last_connected_at ? new Date(data.last_connected_at).getTime() : 0;
      const fresh = Date.now() - last < 90_000; // active in last 90s
      if (data && fresh) {
        setVerified(true);
        setVerifying(false);
        setStudioMeta({ last_connected_at: data.last_connected_at });
        toast.success("Studio connected!");
        return;
      }
      if (tries >= 30) {
        setVerifying(false);
        toast.error("Didn't hear from Studio. Make sure you pasted the token in the plugin.");
        return;
      }
      verifyTimer.current = window.setTimeout(tick, 2000);
    };
    tick();
  };

  useEffect(() => {
    return () => {
      if (verifyTimer.current) window.clearTimeout(verifyTimer.current);
    };
  }, []);

  const completed: Record<string, boolean> = {
    account: !!user,
    install: installed,
    http: httpEnabled,
    token: !!token,
    verify: verified,
    project: verified, // last step completes when user picks/opens a project
  };

  const canAdvance = (i: number) => {
    const id = STEPS[i].id;
    if (id === "account") return !!user;
    if (id === "install") return installed;
    if (id === "http") return httpEnabled;
    if (id === "token") return !!token;
    if (id === "verify") return verified;
    return true;
  };

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center text-muted-foreground">Loading...</div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 mx-auto w-full max-w-5xl px-4 sm:px-6 py-10 space-y-8">
        <div>
          <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-primary-glow">
            <Plug className="h-3.5 w-3.5" /> Plugin Setup Wizard
          </div>
          <h1 className="mt-2 text-3xl sm:text-4xl font-bold tracking-tight">
            Link Roblox Studio to BloxSmith
          </h1>
          <p className="mt-2 text-muted-foreground max-w-2xl leading-relaxed">
            BloxSmith AI is an advanced game-building assistant that helps you build real, playable
            Roblox games from simple prompts. It creates full game systems, places objects into the
            world, inserts Toolbox assets, organizes the Explorer, connects scripts properly, and
            turns an idea into a working game.
          </p>
        </div>

        {/* Progress rail — glassmorphic pill stepper */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <ol className="flex items-center gap-2 sm:gap-3 overflow-x-auto pb-1 -mx-1 px-1">
            {STEPS.map((s, i) => {
              const done = completed[s.id];
              const active = i === step;
              const unlocked = i <= step || completed[STEPS[Math.max(0, i - 1)].id];
              return (
                <li key={s.id} className="flex items-center gap-2 sm:gap-3 shrink-0">
                  <button
                    type="button"
                    onClick={() => unlocked && setStep(i)}
                    disabled={!unlocked}
                    aria-label={`Step ${i + 1}: ${s.title}${completed[s.id] ? " (completed)" : active ? " (current)" : ""}`}
                    aria-current={active ? "step" : undefined}
                    className="flex items-center gap-2 group disabled:cursor-not-allowed"
                  >
                    <span
                      className={`h-8 w-8 grid place-items-center rounded-full text-xs font-bold transition-all ${
                        active
                          ? "bg-primary text-primary-foreground ring-4 ring-primary/20 shadow-[0_0_15px_hsl(var(--primary)/0.4)]"
                          : done
                            ? "bg-primary/20 border border-primary/50 text-primary-glow"
                            : "bg-surface-elevated text-muted-foreground opacity-60 group-hover:opacity-100"
                      }`}
                    >
                      {done && !active ? <Check className="h-4 w-4" /> : i + 1}
                    </span>
                    <span
                      className={`hidden md:inline text-xs font-semibold whitespace-nowrap ${
                        active
                          ? "text-foreground"
                          : done
                            ? "text-muted-foreground"
                            : "text-muted-foreground/60"
                      }`}
                    >
                      {s.title}
                    </span>
                  </button>
                  {i < STEPS.length - 1 && (
                    <span
                      className={`hidden sm:block w-6 h-px ${done ? "bg-primary/40" : "bg-border"}`}
                    />
                  )}
                </li>
              );
            })}
          </ol>
          <div className="text-[11px] font-mono text-muted-foreground tracking-widest uppercase shrink-0">
            Step {String(step + 1).padStart(2, "0")}{" "}
            <span className="text-muted-foreground/40">
              / {String(STEPS.length).padStart(2, "0")}
            </span>
          </div>
        </div>

        {/* Current step body */}
        <div className="relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-b from-primary/20 to-transparent rounded-3xl blur-xl opacity-50 pointer-events-none" />
          <div className="relative premium-card gradient-border p-6 sm:p-10 rounded-3xl">
            {STEPS[step].id === "account" && (
              <StepBlock
                icon={Lock}
                title="Sign in to your BloxSmith account"
                body={
                  user ? (
                    <p>
                      Signed in as <span className="text-foreground font-medium">{user.email}</span>
                      . Continue to step 2 →
                    </p>
                  ) : (
                    <p>You'll need an account to mint a plugin token and own your projects.</p>
                  )
                }
                action={
                  user ? null : (
                    <div className="flex gap-2">
                      <Link
                        to="/login"
                        className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
                      >
                        Sign in
                      </Link>
                      <Link
                        to="/signup"
                        className="rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-surface"
                      >
                        Create account
                      </Link>
                    </div>
                  )
                }
              />
            )}

            {STEPS[step].id === "install" && (
              <StepBlock
                icon={Download}
                title="Install the BloxSmith AI Plugin"
                body={
                  <div className="space-y-4">
                    <p>
                      BloxSmith AI is a powerful Roblox Studio builder that helps you create real,
                      playable Roblox games. It can generate scripts, insert Toolbox assets, build
                      maps, create UI, add game systems, fix errors, and turn simple ideas into
                      working Roblox experiences.
                    </p>

                    <div className="rounded-2xl border border-border bg-surface-elevated/40 p-4 space-y-2">
                      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                        <Laptop className="h-4 w-4 text-primary-glow" />
                        Don't have Roblox Studio?
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Roblox Studio is the official development program for building Roblox games.
                        It is free and available on Windows and macOS.
                      </p>
                      <a
                        href="https://www.roblox.com/create"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-semibold text-primary-glow hover:underline"
                      >
                        Download Roblox Studio <ArrowRight className="h-3 w-3" />
                      </a>
                    </div>

                    <AutoPluginInstaller
                      onInstalled={() => {
                        setInstalled(true);
                        setStep(2);
                      }}
                    />

                    <div className="pt-2">
                      <p className="text-xs text-muted-foreground mb-2">
                        Prefer to install manually? Download the <code>.lua</code> and drop it into
                        your Studio Plugins folder.
                      </p>
                      {user ? (
                        <PluginSourceReveal source={pluginSource} />
                      ) : (
                        <div className="rounded-lg border border-dashed border-border bg-surface/40 px-4 py-3 text-sm text-muted-foreground">
                          <Lock className="mr-2 inline h-4 w-4" />
                          Sign in to view the plugin source code inline.
                        </div>
                      )}
                    </div>
                  </div>
                }
                action={
                  <div className="flex flex-wrap gap-2">
                    <a
                      href={PLUGIN_DOWNLOAD_URL}
                      download="BloxSmith.lua"
                      className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-surface"
                    >
                      <Download className="h-4 w-4" /> Download .lua ({PLUGIN_VERSION})
                    </a>
                    <button
                      onClick={() => {
                        setInstalled(true);
                        setStep(2);
                      }}
                      className="rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-surface"
                    >
                      I've installed it
                    </button>
                  </div>
                }
              />
            )}

            {STEPS[step].id === "http" && (
              <StepBlock
                icon={Wifi}
                title="Allow HTTP Requests in Studio"
                body={
                  <>
                    <p>Studio blocks outbound traffic by default. Enable it once per place:</p>
                    <ol className="mt-3 text-sm text-muted-foreground space-y-1 list-decimal pl-5">
                      <li>Open your place in Roblox Studio.</li>
                      <li>
                        Go to <em>Home → Game Settings → Security</em>.
                      </li>
                      <li>
                        Toggle <em>Allow HTTP Requests</em> on, then click Save.
                      </li>
                    </ol>
                  </>
                }
                action={
                  <button
                    onClick={() => {
                      setHttpEnabled(true);
                      setStep(3);
                    }}
                    className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
                  >
                    HTTP is enabled — continue
                  </button>
                }
              />
            )}

            {STEPS[step].id === "token" && (
              <StepBlock
                icon={KeyRound}
                title="Generate your private plugin token"
                body={
                  <>
                    <p>
                      The token is what tells our servers a Studio session belongs to you. We store
                      only its SHA-256 hash — even we can't read it back. Treat it like a password.
                    </p>
                    {token && (
                      <div className="mt-4 rounded-xl border border-primary/40 bg-primary/5 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <code className="text-sm font-mono break-all text-primary-glow">
                            {showToken ? token : "•".repeat(Math.min(token.length, 48))}
                          </code>
                          <div className="shrink-0 flex items-center gap-2">
                            <button
                              onClick={() => setShowToken((v) => !v)}
                              className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-semibold hover:bg-surface-elevated"
                              title={showToken ? "Hide token" : "Show token"}
                            >
                              {showToken ? (
                                <EyeOff className="h-3 w-3" />
                              ) : (
                                <Eye className="h-3 w-3" />
                              )}
                            </button>
                            <button
                              onClick={copy}
                              className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
                            >
                              <Copy className="h-3 w-3" /> Copy
                            </button>
                          </div>
                        </div>

                        <p className="mt-2 text-[11px] text-muted-foreground">
                          Paste this into the BloxSmith plugin panel in Studio, then continue.
                        </p>
                      </div>
                    )}
                  </>
                }
                action={
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={generate}
                      disabled={genBusy}
                      className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                    >
                      {genBusy ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : token ? (
                        <RefreshCw className="h-4 w-4" />
                      ) : (
                        <KeyRound className="h-4 w-4" />
                      )}
                      {token ? "Regenerate token" : "Generate token"}
                    </button>
                    {token && (
                      <button
                        onClick={() => setStep(4)}
                        className="rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-surface"
                      >
                        I pasted it in Studio
                      </button>
                    )}
                  </div>
                }
              />
            )}

            {STEPS[step].id === "verify" && (
              <StepBlock
                icon={ShieldCheck}
                title="Verify the live connection"
                body={
                  <>
                    <p>
                      Click <em>Connect</em> in the BloxSmith plugin panel in Studio. We'll watch
                      for the handshake.
                    </p>
                    {verified && studioMeta?.last_connected_at && (
                      <div className="mt-3 inline-flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-primary-glow">
                        <Check className="h-4 w-4" /> Connected at{" "}
                        {new Date(studioMeta.last_connected_at).toLocaleTimeString()}
                      </div>
                    )}
                  </>
                }
                action={
                  <div className="flex flex-wrap gap-2">
                    {!verified ? (
                      <button
                        onClick={startVerify}
                        disabled={verifying}
                        className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                      >
                        {verifying ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" /> Waiting for Studio…
                          </>
                        ) : (
                          <>
                            <ShieldCheck className="h-4 w-4" /> Check connection
                          </>
                        )}
                      </button>
                    ) : (
                      <button
                        onClick={() => setStep(5)}
                        className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
                      >
                        Continue <ArrowRight className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                }
              />
            )}

            {STEPS[step].id === "project" && (
              <StepBlock
                icon={Rocket}
                title="Pick a project to sync"
                body={
                  projects.length === 0 ? (
                    <p>
                      You don't have any projects yet. Create one from the dashboard, then come back
                      here to sync it.
                    </p>
                  ) : (
                    <div className="mt-3 grid sm:grid-cols-2 gap-2">
                      {projects.slice(0, 8).map((p) => (
                        <button
                          key={p.id}
                          onClick={() =>
                            nav({ to: "/project/$projectId", params: { projectId: p.id } })
                          }
                          className="text-left rounded-xl border border-border bg-surface/40 hover:bg-surface px-4 py-3"
                        >
                          <div className="text-sm font-semibold truncate">{p.name}</div>
                          <div className="text-[11px] text-muted-foreground">
                            {p.game_type} · updated {new Date(p.updated_at).toLocaleDateString()}
                          </div>
                        </button>
                      ))}
                    </div>
                  )
                }
                action={
                  <div className="flex flex-wrap gap-2">
                    <Link
                      to="/dashboard"
                      className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
                    >
                      Open dashboard
                    </Link>
                  </div>
                }
              />
            )}

            {/* nav buttons */}
            <div className="mt-6 flex items-center justify-between gap-3 border-t border-border pt-4">
              <button
                onClick={() => setStep((s) => Math.max(0, s - 1))}
                disabled={step === 0}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-surface disabled:opacity-40"
              >
                Back
              </button>
              <div className="text-xs text-muted-foreground">
                Step {step + 1} of {STEPS.length}
              </div>
              <button
                onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
                disabled={!canAdvance(step) || step === STEPS.length - 1}
                className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-40"
              >
                Next <ArrowRight className="h-3 w-3" />
              </button>
            </div>
          </div>
        </div>

        {/* Security footer — pill style */}
        <div className="flex items-center gap-3 py-3 px-5 rounded-full border border-border bg-surface/40 text-xs text-muted-foreground">
          <span className="flex items-center gap-2 shrink-0">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
            <span className="font-bold uppercase tracking-widest text-foreground/80">Security</span>
          </span>
          <p className="leading-relaxed">
            Tokens are SHA-256 hashed and scoped per user. Revoke anytime from this wizard or your{" "}
            <Link to="/account" className="text-primary-glow hover:underline">
              Account
            </Link>
            . All Studio traffic flows over HTTPS to{" "}
            <code className="text-primary-glow/90">/api/public/plugin/*</code>.
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
}

function StepBlock({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: typeof Plug;
  title: string;
  body: React.ReactNode;
  action: React.ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row gap-6">
      <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-primary to-primary-glow grid place-items-center shrink-0 shadow-lg shadow-primary/30">
        <Icon className="h-7 w-7 text-primary-foreground" />
      </div>
      <div className="flex-1 space-y-3">
        <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
        <div className="text-sm text-muted-foreground leading-relaxed">{body}</div>
        {action && <div className="pt-2">{action}</div>}
      </div>
    </div>
  );
}

function PluginSourceReveal({ source }: { source: string }) {
  const [open, setOpen] = useState(false);
  const lineCount = source.split("\n").length;
  const copy = async () => {
    await navigator.clipboard.writeText(source);
    toast.success("Plugin source copied");
  };
  return (
    <div className="rounded-lg border border-border bg-surface/60 overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-border">
        <div className="flex items-center gap-2 text-sm">
          <ShieldCheck className="h-4 w-4 text-primary-glow" />
          <span className="font-semibold text-foreground">BloxSmith.server.lua</span>
          <span className="text-muted-foreground">
            · {lineCount} lines · {PLUGIN_VERSION}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={copy}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-semibold hover:bg-surface"
          >
            <Copy className="h-3.5 w-3.5" /> Copy
          </button>
          <button
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-semibold hover:bg-surface"
          >
            {open ? "Hide code" : "Reveal code"}
          </button>
        </div>
      </div>
      {open && (
        <pre className="max-h-96 overflow-auto bg-background/60 px-4 py-3 text-xs leading-relaxed text-foreground/90">
          <code>{source}</code>
        </pre>
      )}
    </div>
  );
}
