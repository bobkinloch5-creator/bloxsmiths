import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";
import { useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";

type Profile = {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  banner_url?: string | null;
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
  const authReadyRef = useRef(false);
  const router = useRouter();
  const qc = useQueryClient();

  const loadProfile = async (uid: string) => {
    try {
      const [{ data: p }, { data: r }] = await Promise.all([
        supabase
          .from("profiles")
          .select(
            "id,email,display_name,avatar_url,banner_url,credits,discord_claimed,referral_code,referred_by",
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
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (s?.user) {
        setTimeout(() => loadProfile(s.user.id), 0);
      } else {
        setProfile(null);
        setRoles([]);
      }
      if (event === "INITIAL_SESSION" || event === "SIGNED_IN" || event === "SIGNED_OUT") {
        authReadyRef.current = true;
        setLoading(false);
      }
      router.invalidate();
      qc.invalidateQueries();
    });

    supabase.auth
      .getSession()
      .then(({ data }) => {
        setSession(data.session);
        authReadyRef.current = true;
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

  // Idle auto-logout: only after a long period of real inactivity.
  useEffect(() => {
    if (!session?.user || !authReadyRef.current) return;
    const IDLE_MS = 2 * 60 * 60 * 1000;
    let lastActivity = Date.now();
    let interval: ReturnType<typeof setInterval> | null = null;

    const markActive = () => {
      if (document.visibilityState !== "visible") return;
      lastActivity = Date.now();
    };

    const checkIdle = async () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastActivity < IDLE_MS) return;
      if (!session?.user) return;
      await supabase.auth.signOut();
      try {
        router.navigate({ to: "/login", search: { reason: "idle" } as any });
      } catch {
        /* noop */
      }
    };

    const events = ["mousemove", "keydown", "click", "touchstart", "pointerdown"];
    events.forEach((e) => window.addEventListener(e, markActive, { passive: true }));
    interval = setInterval(() => {
      void checkIdle();
    }, 60_000);

    return () => {
      if (interval) clearInterval(interval);
      events.forEach((e) => window.removeEventListener(e, markActive));
    };
  }, [session?.user?.id, router, session]);

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
