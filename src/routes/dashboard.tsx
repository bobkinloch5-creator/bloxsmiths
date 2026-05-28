import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Header, Footer } from "@/components/layout";
import { useAuth } from "@/lib/auth-context";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { createProject as createProjectFn } from "@/lib/projects.functions";
import { ensureStarterProject as ensureStarterFn } from "@/lib/stats.functions";
import { GAME_TYPES, STARTER_TEMPLATES } from "@/lib/templates";
import {
  Plus,
  Folder,
  Plug,
  BookOpen,
  CreditCard,
  ShieldCheck,
  X,
  Gamepad2,
  Sparkles,
  Gift,
  Ticket,
} from "lucide-react";
import { toast } from "sonner";
import { Onboarding } from "@/components/Onboarding";
import { UsageRemaining } from "@/components/UsageRemaining";
import { useDailyClaimCooldown } from "@/hooks/useDailyClaimCooldown";

export const Route = createFileRoute("/dashboard")({
  component: Dashboard,
  head: () => ({
    meta: [
      { title: "Dashboard — BloxSmith" },
      { name: "description", content: "Your BloxSmith dashboard." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

type Project = { id: string; name: string; game_type: string; updated_at: string; status: string };

function Dashboard() {
  const { user, profile, loading, isOwner, isAdmin } = useAuth();
  const nav = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [replayTour, setReplayTour] = useState(false);
  const [promoCode, setPromoCode] = useState("");
  const [redeeming, setRedeeming] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const dailyCd = useDailyClaimCooldown(user?.id);

  const refreshCredits = async () => {
    if (!user) return;
    const { data } = await supabase.from("profiles").select("credits").eq("id", user.id).single();
    if (data && profile) (profile as { credits: number }).credits = data.credits;
  };

  const redeemPromo = async () => {
    const code = promoCode.trim();
    if (!code) return;
    setRedeeming(true);
    const { data, error } = await supabase.rpc("redeem_promo_code", { _code: code });
    setRedeeming(false);
    if (error) {
      const map: Record<string, string> = {
        invalid_code: "Invalid promo code",
        inactive_code: "This code is no longer active",
        expired_code: "This code has expired",
        limit_reached: "This code has reached its redemption limit",
        already_redeemed: "You already redeemed this code",
      };
      return toast.error(map[error.message] ?? error.message);
    }
    toast.success(`Promo redeemed — balance: ${data} credits`);
    setPromoCode("");
    await refreshCredits();
    window.location.reload();
  };

  const claimDaily = async () => {
    if (dailyCd.onCooldown) return;
    setClaiming(true);
    const { data, error } = await supabase.rpc("claim_daily_credits");
    setClaiming(false);
    if (error) {
      if (error.message.includes("email_not_confirmed"))
        return toast.error("Please confirm your email before claiming daily credits.");
      if (error.message.includes("account_too_new"))
        return toast.error("Account is too new — try again in a few minutes.");
      return toast.error(error.message);
    }
    const res = data as { claimed: boolean; reason?: string; amount?: number; credits?: number };
    if (!res.claimed) {
      dailyCd.start();
      return toast.info("Already claimed today — come back tomorrow!");
    }
    dailyCd.start();
    toast.success(`+${res.amount} daily credits! Balance: ${res.credits}`);
    window.location.reload();
  };
  const [form, setForm] = useState({
    name: "",
    game_type: "Custom" as string,
    template: "Blank" as string,
    description: "",
  });
  const runCreate = useServerFn(createProjectFn);
  const runEnsureStarter = useServerFn(ensureStarterFn);

  useEffect(() => {
    if (!loading && !user) nav({ to: "/login" });
  }, [loading, user, nav]);

  useEffect(() => {
    if (!user) return;
    const loadProjects = async () => {
      const { data } = await supabase
        .from("projects")
        .select("id,name,game_type,updated_at,status")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false });
      const list = (data ?? []) as Project[];
      setProjects(list);
      // Auto-create starter project for brand-new users (once).
      const FLAG = `bloxsmith.starter.${user.id}`;
      if (list.length === 0 && typeof window !== "undefined" && !localStorage.getItem(FLAG)) {
        localStorage.setItem(FLAG, "1");
        try {
          const res = await runEnsureStarter({});
          if (res.created) {
            toast.success("We created a starter project to get you going 🚀");
            const { data: refreshed } = await supabase
              .from("projects")
              .select("id,name,game_type,updated_at,status")
              .eq("user_id", user.id)
              .order("updated_at", { ascending: false });
            setProjects((refreshed ?? []) as Project[]);
          }
        } catch {
          /* ignore */
        }
      }
    };
    loadProjects();
  }, [user, runEnsureStarter]);

  const submit = async () => {
    if (!form.name.trim()) return toast.error("Name your project");
    setBusy(true);
    try {
      const { id } = await runCreate({ data: form });
      toast.success("Project created");
      nav({ to: "/project/$projectId", params: { projectId: id } });
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  };

  const deleteProject = async (id: string) => {
    if (!user) return;
    if (!confirm("Delete this project?")) return;
    const { error } = await supabase.from("projects").delete().eq("id", id).eq("user_id", user.id);
    if (error) return toast.error(error.message);
    setProjects((p) => p.filter((x) => x.id !== id));
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 mx-auto w-full max-w-7xl px-4 sm:px-6 py-8 space-y-8 animate-pulse">
          <div className="space-y-3">
            <div className="h-8 w-64 rounded bg-surface-elevated" />
            <div className="h-4 w-40 rounded bg-surface-elevated" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-20 rounded-2xl bg-surface-elevated" />
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-32 rounded-2xl bg-surface-elevated" />
            ))}
          </div>
        </main>
      </div>
    );
  }
  if (!user) return null;

  return (
    <div className="min-h-screen flex flex-col">
      <Onboarding force={replayTour} onClose={() => setReplayTour(false)} />
      <Header />

      <main className="flex-1 mx-auto w-full max-w-7xl px-4 sm:px-6 py-8 space-y-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">
              Welcome back, {profile?.display_name ?? "builder"}
            </h1>
            <div className="mt-2 flex items-center gap-2 text-sm">
              {isOwner ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 border border-primary/20 px-2.5 py-0.5 text-xs font-semibold text-primary-glow">
                  Owner — unlimited credits
                </span>
              ) : (
                <Link
                  to="/pricing"
                  className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 border border-primary/20 px-2.5 py-0.5 text-xs font-semibold text-primary-glow hover:bg-primary/20 transition"
                >
                  {profile?.credits ?? 0} credits available
                </Link>
              )}
              {isAdmin && !isOwner && <span className="text-muted-foreground">· Admin</span>}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setReplayTour(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-surface-elevated transition"
            >
              <Sparkles className="h-3.5 w-3.5" /> Take the tour
            </button>
            <a
              href="roblox-studio:"
              className="inline-flex items-center gap-2 rounded-xl border border-primary/40 bg-primary/10 px-4 py-2.5 text-sm font-semibold text-primary-glow hover:bg-primary/20 transition"
            >
              <Gamepad2 className="h-4 w-4" /> Open Roblox Studio
            </a>
            <button
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" /> New Roblox Game
            </button>
          </div>
        </div>

        {!isOwner && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="glass rounded-2xl p-5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-primary/15 grid place-items-center">
                  <Gift className="h-5 w-5 text-primary-glow" />
                </div>
                <div>
                  <div className="font-medium">Daily free credits</div>
                  <div className="text-xs text-muted-foreground">
                    Claim +10 credits, once per day.
                  </div>
                </div>
              </div>
              <button
                onClick={claimDaily}
                disabled={claiming || dailyCd.onCooldown}
                title={dailyCd.onCooldown ? `Next claim in ${dailyCd.label}` : undefined}
                className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                {claiming
                  ? "Claiming…"
                  : dailyCd.onCooldown
                    ? `Next in ${dailyCd.label}`
                    : "Claim +10"}
              </button>
            </div>
            <div className="glass rounded-2xl p-5 flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary/15 grid place-items-center shrink-0">
                <Ticket className="h-5 w-5 text-primary-glow" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium">Have a promo code?</div>
                <div className="mt-1.5 flex gap-2">
                  <input
                    value={promoCode}
                    onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                    placeholder="ENTER CODE"
                    className="flex-1 min-w-0 rounded-lg bg-surface-elevated border border-border px-3 py-2 text-sm uppercase"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") redeemPromo();
                    }}
                  />
                  <button
                    onClick={redeemPromo}
                    disabled={redeeming || !promoCode.trim()}
                    className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                  >
                    {redeeming ? "…" : "Redeem"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {!isOwner && <UsageRemaining />}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: Gamepad2, label: "Open Roblox Studio", external: "roblox-studio:" },
            { icon: Plug, label: "Plugin Setup", to: "/plugin" as const },
            { icon: BookOpen, label: "Documentation", to: "/docs" as const },
            { icon: CreditCard, label: "Buy Credits", to: "/pricing" as const },
          ].map((a) => {
            const inner = (
              <>
                <div className="h-10 w-10 rounded-xl bg-primary/15 grid place-items-center">
                  <a.icon className="h-5 w-5 text-primary-glow" />
                </div>
                <span className="font-medium">{a.label}</span>
              </>
            );
            return "external" in a && a.external ? (
              <a
                key={a.label}
                href={a.external}
                className="glass rounded-2xl p-5 hover:bg-surface transition flex items-center gap-3"
              >
                {inner}
              </a>
            ) : (
              <Link
                key={a.label}
                to={a.to!}
                className="glass rounded-2xl p-5 hover:bg-surface transition flex items-center gap-3"
              >
                {inner}
              </Link>
            );
          })}
        </div>

        <section>
          <h2 className="text-xl font-bold mb-4">Your projects</h2>
          {projects.length === 0 ? (
            <div className="glass rounded-2xl p-10 text-center text-muted-foreground">
              <Folder className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p>No projects yet. Create your first Roblox game.</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map((p) => (
                <div key={p.id} className="glass rounded-2xl p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold">{p.name}</h3>
                      <p className="text-xs text-muted-foreground mt-1">
                        {p.game_type} · {p.status}
                      </p>
                    </div>
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {new Date(p.updated_at).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="mt-4 flex gap-2">
                    <Link
                      to="/project/$projectId"
                      params={{ projectId: p.id }}
                      className="flex-1 text-center rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
                    >
                      Open
                    </Link>
                    <button
                      onClick={() => deleteProject(p.id)}
                      className="rounded-lg border border-border px-3 py-2 text-xs hover:bg-destructive/10"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {isAdmin && (
          <Link
            to="/admin"
            className="glass rounded-2xl p-5 flex items-center gap-3 hover:bg-surface"
          >
            <ShieldCheck className="h-5 w-5 text-primary-glow" />
            <span className="font-medium">Admin dashboard</span>
          </Link>
        )}
      </main>

      {showCreate && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
          onClick={() => setShowCreate(false)}
        >
          <div
            className="glass rounded-2xl p-6 w-full max-w-md space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-bold">New Roblox Game</h2>
              <button onClick={() => setShowCreate(false)}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <input
              placeholder="Game name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full rounded-lg bg-surface-elevated border border-border px-3 py-2 text-sm"
            />
            <textarea
              placeholder="Short description (optional)"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full rounded-lg bg-surface-elevated border border-border px-3 py-2 text-sm"
              rows={2}
            />
            <div className="grid grid-cols-2 gap-2">
              <select
                value={form.game_type}
                onChange={(e) => setForm({ ...form, game_type: e.target.value })}
                className="rounded-lg bg-surface-elevated border border-border px-3 py-2 text-sm"
              >
                {GAME_TYPES.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
              <select
                value={form.template}
                onChange={(e) => setForm({ ...form, template: e.target.value })}
                className="rounded-lg bg-surface-elevated border border-border px-3 py-2 text-sm"
              >
                {STARTER_TEMPLATES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={submit}
              disabled={busy}
              className="w-full rounded-lg bg-primary px-4 py-2.5 font-semibold text-primary-foreground disabled:opacity-50"
            >
              {busy ? "Creating…" : "Create project"}
            </button>
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
}
