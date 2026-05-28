import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { toast } from "sonner";
import logo from "@/assets/logo.png";

export const Route = createFileRoute("/signup")({
  component: SignupPage,
  head: () => ({
    meta: [
      { title: "Sign up — BloxSmith" },
      {
        name: "description",
        content:
          "Create a free BloxSmith account to start building Roblox games with AI — 150 starter credits, no card required, sync straight into Studio.",
      },
      { property: "og:title", content: "Sign up for BloxSmith — Free Roblox AI Builder" },
      {
        property: "og:description",
        content:
          "Start building Roblox games with AI in minutes. Free starter credits, no credit card, instant Roblox Studio sync.",
      },
      { property: "og:url", content: "https://bloxsmith.pro/signup" },
    ],
    links: [{ rel: "canonical", href: "https://bloxsmith.pro/signup" }],
  }),
});

function SignupPage() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [refCode, setRefCode] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const formatAuthError = (message: string) => {
    if (message.includes("weak_password") || message.includes("known to be weak")) {
      return "That password is too weak or has appeared in known leaks. Use a longer, more unique password.";
    }
    if (message.includes("email_address_invalid")) {
      return "Please enter a valid email address.";
    }
    if (message.includes("email_exists") || message.includes("already registered")) {
      return "That email already has an account. Try logging in instead.";
    }
    if (message.includes("email_domain_not_allowed")) {
      return "That email domain is blocked. Please use a real, non-disposable email address.";
    }
    return message;
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const r = params.get("ref");
    if (r) {
      const clean = r.trim().toLowerCase();
      setRefCode(clean);
      localStorage.setItem("bloxsmith_ref", clean);
    } else {
      const stored = localStorage.getItem("bloxsmith_ref");
      if (stored) setRefCode(stored);
    }
  }, []);

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/dashboard`,
          data: { display_name: name, ref: refCode ?? undefined },
        },
      });
      if (error) {
        const message = formatAuthError(error.message);
        setErrorMessage(message);
        toast.error(message);
        return;
      }
      if (data.session) {
        toast.success("Account created — you’re now signed in.");
        nav({ to: "/dashboard" });
        return;
      }

      const message = "Account created. Check your email and confirm your address before logging in.";
      setSuccessMessage(message);
      toast.success(message);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Sign up failed — please try again.";
      setErrorMessage(formatAuthError(msg));
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    const res = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin + "/dashboard",
    });
    if (res.error) toast.error(res.error.message ?? "Sign up failed");
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
        <h1 className="text-2xl font-bold text-center">Create your account</h1>
        <p className="text-sm text-muted-foreground text-center mt-1">
          Get 150 free credits to start, plus 10 free daily.
        </p>
        {errorMessage && (
          <p className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {errorMessage}
          </p>
        )}
        {successMessage && (
          <p className="mt-3 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary-glow">
            {successMessage}
          </p>
        )}
        {refCode && (
          <p className="text-xs text-center mt-2 text-primary-glow">
            🎁 Referral applied: <span className="font-mono">{refCode}</span> — +10 bonus credits
            after signup.
          </p>
        )}
        <a
          href="https://discord.gg/J9TU7syJCr"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 block text-center text-xs rounded-lg bg-[#5865F2]/10 border border-[#5865F2]/30 text-[#a3b1ff] hover:bg-[#5865F2]/20 py-2 font-semibold transition"
        >
          + Join our Discord for an extra 5 credits
        </a>
        <button
          onClick={handleGoogle}
          className="mt-6 w-full rounded-lg border border-border bg-surface py-2.5 text-sm font-medium hover:bg-surface-elevated"
        >
          Continue with Google
        </button>
        <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
          <div className="flex-1 h-px bg-border" />
          or
          <div className="flex-1 h-px bg-border" />
        </div>
        <form onSubmit={handle} className="space-y-3">
          <label htmlFor="signup-name" className="sr-only">
            Display name
          </label>
          <input
            id="signup-name"
            placeholder="Display name"
            aria-label="Display name"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg bg-input border border-border px-3 py-2.5 text-sm"
          />
          <label htmlFor="signup-email" className="sr-only">
            Email
          </label>
          <input
            id="signup-email"
            type="email"
            required
            placeholder="Email"
            aria-label="Email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg bg-input border border-border px-3 py-2.5 text-sm"
          />
          <label htmlFor="signup-password" className="sr-only">
            Password
          </label>
          <input
            id="signup-password"
            type="password"
            required
            minLength={6}
            placeholder="Password (min 6 chars)"
            aria-label="Password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg bg-input border border-border px-3 py-2.5 text-sm"
          />
          <button
            disabled={loading}
            className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {loading ? "Creating..." : "Create account"}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already have one?{" "}
          <Link to="/login" className="text-primary-glow">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
