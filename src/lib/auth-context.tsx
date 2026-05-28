import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";
import { useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";

type Profile = {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  credits: number;
  discord_claimed?: boolean;
  referral_code?: string | null;
  referred_by?: string | null;
};

type Role = "owner" | "admin" | "user";

type AuthCtx = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  roles: Role[];
  isOwner: boolean;
  isAdmin: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const qc = useQueryClient();

  const loadProfile = async (uid: string) => {
    try {
      const [{ data: p }, { data: r }] = await Promise.all([
        supabase
          .from("profiles")
          .select(
            "id,email,display_name,avatar_url,credits,discord_claimed,referral_code,referred_by",
          )
          .eq("id", uid)
          .maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", uid),
      ]);
      setProfile(p as Profile | null);
      setRoles(((r ?? []) as { role: Role }[]).map((x) => x.role));
    } catch (e) {
      // Supabase unreachable/unconfigured — don't crash; leave profile empty.
      console.error("[auth] failed to load profile:", e instanceof Error ? e.message : e);
      setProfile(null);
      setRoles([]);
    }
  };

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (s?.user) {
        setTimeout(() => loadProfile(s.user.id), 0);
      } else {
        setProfile(null);
        setRoles([]);
      }
      router.invalidate();
      qc.invalidateQueries();
    });

    supabase.auth
      .getSession()
      .then(({ data }) => {
        setSession(data.session);
        if (data.session?.user) loadProfile(data.session.user.id).finally(() => setLoading(false));
        else setLoading(false);
      })
      .catch((e: unknown) => {
        console.error("[auth] getSession failed:", e instanceof Error ? e.message : e);
        setLoading(false);
      });

    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Idle auto-logout: sign out after 30 minutes of no user activity, then bounce to /login.
  useEffect(() => {
    if (!session?.user) return;
    const IDLE_MS = 30 * 60 * 1000;
    let timer: ReturnType<typeof setTimeout>;
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        await supabase.auth.signOut();
        try {
          router.navigate({ to: "/login", search: { reason: "idle" } as any });
        } catch {
          /* noop */
        }
      }, IDLE_MS);
    };
    const events = ["mousemove", "keydown", "click", "touchstart", "scroll", "visibilitychange"];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [session?.user?.id, router]);

  const value: AuthCtx = {
    session,
    user: session?.user ?? null,
    profile,
    roles,
    isOwner: roles.includes("owner"),
    isAdmin: roles.includes("admin") || roles.includes("owner"),
    loading,
    signOut: async () => {
      await supabase.auth.signOut();
    },
    refresh: async () => {
      if (session?.user) await loadProfile(session.user.id);
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used inside AuthProvider");
  return v;
}
