import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { toast } from "sonner";
import logo from "@/assets/logo.png";

export const Route = createFileRoute("/login")({
  component: LoginPage,
  head: () => ({
    meta: [
      { title: "Log in — BloxSmith" },
      {
        name: "description",
        content:
          "Log in to your BloxSmith account to keep building Roblox games with AI, manage your projects, and sync to Roblox Studio.",
      },
      { property: "og:title", content: "Log in to BloxSmith — Roblox AI Builder" },
      {
        property: "og:description",
        content:
          "Sign back in to BloxSmith to continue building Roblox games with AI and sync them into Roblox Studio.",
      },
      { property: "og:url", content: "https://bloxsmith.pro/login" },
    ],
    links: [{ rel: "canonical", href: "https://bloxsmith.pro/login" }],
  }),
});

function LoginPage() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const formatAuthError = (message: string) => {
    if (message.includes("email_not_confirmed")) {
      return "Your email is not confirmed yet. Please open the confirmation email before logging in.";
    }
    if (message.includes("Invalid login credentials")) {
      return "Incorrect email or password.";
    }
    return message;
  };

  const redirectAfterLogin = async () => {
    const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (data?.nextLevel === "aal2" && data?.currentLevel !== "aal2") {
      toast.info("Enter your 2FA code to finish signing in.");
      nav({ to: "/mfa" });
      return;
    }
    toast.success("Welcome back!");
    nav({ to: "/dashboard" });
  };

  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage(null);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        const message = formatAuthError(error.message);
        setErrorMessage(message);
        toast.error(message);
        return;
      }
      await redirectAfterLogin();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Sign in failed — please try again.";
      const formatted = formatAuthError(msg);
      setErrorMessage(formatted);
      toast.error(formatted);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    const res = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin + "/mfa",
    });
    if (res.error) toast.error(res.error.message ?? "Sign in failed");
  };

  const handleApple = async () => {
    const res = await lovable.auth.signInWithOAuth("apple", {
      redirect_uri: window.location.origin + "/mfa",
    });
    if (res.error) toast.error(res.error.message ?? "Sign in failed");
  };

  return (
    <div className="min-h-screen grid place-items-center px-4">
      <div className="w-full max-w-md glass-strong rounded-2xl p-8">
        <Link to="/" className="flex items-center gap-2 justify-center mb-6">
          <img src={logo} alt="BloxSmith logo" width={36} height={36} className="h-9 w-9" />
          <span className="text-xl font-bold">
            Blox<span className="gradient-text">Smith</span>
          </span>
        </Link>
        <h1 className="text-2xl font-bold text-center">Welcome back</h1>
        <p className="text-sm text-muted-foreground text-center mt-1">Log in to keep building.</p>
        {errorMessage && (
          <p className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {errorMessage}
          </p>
        )}
        <div className="mt-6 grid grid-cols-2 gap-2">
          <button
            onClick={handleGoogle}
            className="rounded-lg border border-border bg-surface py-2.5 text-sm font-medium hover:bg-surface-elevated inline-flex items-center justify-center gap-2"
          >
            <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
              <path
                fill="#FFC107"
                d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8a12 12 0 1 1 0-24c3 0 5.8 1.1 7.9 3l5.7-5.7A20 20 0 1 0 24 44a20 20 0 0 0 19.6-23.5z"
              />
              <path
                fill="#FF3D00"
                d="M6.3 14.7l6.6 4.8A12 12 0 0 1 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7A20 20 0 0 0 6.3 14.7z"
              />
              <path
                fill="#4CAF50"
                d="M24 44a20 20 0 0 0 13.5-5.2l-6.2-5.3A12 12 0 0 1 12.7 28l-6.5 5A20 20 0 0 0 24 44z"
              />
              <path
                fill="#1976D2"
                d="M43.6 20.5H42V20H24v8h11.3a12 12 0 0 1-4.1 5.5l6.2 5.3C40.9 35.8 44 30.4 44 24c0-1.2-.1-2.4-.4-3.5z"
              />
            </svg>
            Google
          </button>
          <button
            onClick={handleApple}
            className="rounded-lg border border-border bg-surface py-2.5 text-sm font-medium hover:bg-surface-elevated inline-flex items-center justify-center gap-2"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M17.05 12.04c0-2.18 1.78-3.23 1.86-3.28-1.02-1.49-2.6-1.7-3.16-1.72-1.34-.14-2.62.79-3.31.79-.68 0-1.74-.77-2.87-.75-1.48.02-2.84.86-3.6 2.18-1.53 2.65-.39 6.57 1.1 8.72.73 1.05 1.6 2.24 2.73 2.2 1.1-.04 1.52-.71 2.85-.71s1.7.71 2.87.69c1.19-.02 1.93-1.07 2.65-2.13.84-1.23 1.18-2.42 1.2-2.48-.03-.02-2.3-.89-2.32-3.51zM14.94 5.55c.6-.73 1-1.74.89-2.75-.86.04-1.91.58-2.53 1.3-.55.64-1.04 1.67-.91 2.66.97.07 1.95-.49 2.55-1.21z" />
            </svg>
            Apple
          </button>
        </div>
        <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
          <div className="flex-1 h-px bg-border" />
          or
          <div className="flex-1 h-px bg-border" />
        </div>
        <form onSubmit={handleEmail} className="space-y-3">
          <label htmlFor="login-email" className="sr-only">
            Email
          </label>
          <input
            id="login-email"
            type="email"
            required
            placeholder="Email"
            aria-label="Email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg bg-input border border-border px-3 py-2.5 text-sm"
          />
          <label htmlFor="login-password" className="sr-only">
            Password
          </label>
          <input
            id="login-password"
            type="password"
            required
            placeholder="Password"
            aria-label="Password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg bg-input border border-border px-3 py-2.5 text-sm"
          />
          <button
            disabled={loading}
            className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          No account?{" "}
          <Link to="/signup" className="text-primary-glow">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
