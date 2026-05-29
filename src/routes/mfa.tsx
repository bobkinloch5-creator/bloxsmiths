import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import logo from "@/assets/logo.png";
import { toast } from "sonner";
import { KeyRound, Loader2, QrCode, ShieldCheck, Trash2 } from "lucide-react";

export const Route = createFileRoute("/mfa")({
  component: MfaPage,
  head: () => ({
    meta: [
      { title: "Two-Factor Security — BloxSmith" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

type TotpFactor = {
  id: string;
  friendly_name?: string;
  factor_type: "totp";
  status: "verified" | "unverified";
  created_at?: string;
};

function MfaPage() {
  const nav = useNavigate();
  const { user, loading } = useAuth();
  const [busy, setBusy] = useState(false);
  const [factors, setFactors] = useState<TotpFactor[]>([]);
  const [selectedFactorId, setSelectedFactorId] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [code, setCode] = useState("");
  const [enrolling, setEnrolling] = useState(false);
  const [newFactorId, setNewFactorId] = useState("");
  const [newFactorSecret, setNewFactorSecret] = useState("");
  const [newFactorQr, setNewFactorQr] = useState("");

  const verifiedFactors = useMemo(
    () => factors.filter((factor) => factor.status === "verified"),
    [factors],
  );

  const loadFactors = async () => {
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) {
      toast.error(error.message);
      return;
    }
    const totp = (data?.totp ?? []) as TotpFactor[];
    setFactors(totp);
    const firstVerified = totp.find((factor) => factor.status === "verified");
    if (firstVerified) setSelectedFactorId((current) => current || firstVerified.id);
  };

  useEffect(() => {
    if (!loading && !user) nav({ to: "/login" });
  }, [loading, user, nav]);

  useEffect(() => {
    if (!user) return;
    void loadFactors();
  }, [user]);

  const startChallenge = async (factorId = selectedFactorId) => {
    if (!factorId) return toast.error("Choose a 2FA factor first.");
    setBusy(true);
    const { data, error } = await supabase.auth.mfa.challenge({ factorId });
    setBusy(false);
    if (error) return toast.error(error.message);
    setSelectedFactorId(factorId);
    setChallengeId(data.id);
    toast.success("Enter the 6-digit code from your authenticator app.");
  };

  const verifyChallenge = async () => {
    const cleanCode = code.trim().replace(/\s/g, "");
    if (!selectedFactorId || !challengeId) return toast.error("Start verification first.");
    if (!/^\d{6}$/.test(cleanCode)) return toast.error("Enter a valid 6-digit code.");
    setBusy(true);
    const { error } = await supabase.auth.mfa.verify({
      factorId: selectedFactorId,
      challengeId,
      code: cleanCode,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("2FA verified. Your session is secured.");
    setCode("");
    setChallengeId("");
    await loadFactors();
    nav({ to: "/dashboard" });
  };

  const beginEnrollment = async () => {
    setEnrolling(true);
    setCode("");
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "BloxSmith Authenticator",
    });
    setEnrolling(false);
    if (error) return toast.error(error.message);
    setNewFactorId(data.id);
    setNewFactorSecret(data.totp.secret);
    setNewFactorQr(data.totp.qr_code);
    toast.success("Scan the QR code, then enter your 6-digit code to finish setup.");
  };

  const verifyEnrollment = async () => {
    const cleanCode = code.trim().replace(/\s/g, "");
    if (!newFactorId) return toast.error("Start 2FA setup first.");
    if (!/^\d{6}$/.test(cleanCode)) return toast.error("Enter a valid 6-digit code.");
    setBusy(true);
    const challenge = await supabase.auth.mfa.challenge({ factorId: newFactorId });
    if (challenge.error) {
      setBusy(false);
      return toast.error(challenge.error.message);
    }
    const verify = await supabase.auth.mfa.verify({
      factorId: newFactorId,
      challengeId: challenge.data.id,
      code: cleanCode,
    });
    setBusy(false);
    if (verify.error) return toast.error(verify.error.message);
    toast.success("2FA is now enabled on your BloxSmith account.");
    setCode("");
    setNewFactorId("");
    setNewFactorSecret("");
    setNewFactorQr("");
    await loadFactors();
  };

  const removeFactor = async (factorId: string) => {
    if (!confirm("Remove this 2FA authenticator from your account?")) return;
    setBusy(true);
    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("2FA authenticator removed.");
    await loadFactors();
  };

  if (loading || !user) return null;

  return (
    <div className="min-h-screen px-4 py-8 text-foreground">
      <div className="mx-auto w-full max-w-xl glass-strong rounded-2xl p-6 sm:p-8">
        <Link to="/" className="mb-6 flex items-center justify-center gap-2">
          <img src={logo} alt="BloxSmith logo" width={36} height={36} className="h-9 w-9" />
          <span className="text-xl font-bold">
            Blox<span className="gradient-text">Smith</span>
          </span>
        </Link>

        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-primary/15 text-primary-glow">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-black">Two-Factor Security</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Protect BloxSmith accounts with an authenticator app like Google Authenticator, Authy, or 1Password.
          </p>
        </div>

        {verifiedFactors.length > 0 ? (
          <section className="space-y-4 rounded-xl border border-border/60 bg-surface/30 p-4">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-bold">
                <KeyRound className="h-4 w-4 text-primary" /> Verify 2FA
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Your account has 2FA enabled. Enter a code when asked after login.
              </p>
            </div>

            <select
              value={selectedFactorId}
              onChange={(e) => setSelectedFactorId(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm"
            >
              {verifiedFactors.map((factor) => (
                <option key={factor.id} value={factor.id}>
                  {factor.friendly_name || "Authenticator app"}
                </option>
              ))}
            </select>

            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="123456"
                className="rounded-lg border border-border bg-input px-3 py-2 text-center font-mono tracking-[0.35em]"
              />
              <button
                type="button"
                onClick={() => (challengeId ? verifyChallenge() : startChallenge())}
                disabled={busy}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-60"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : challengeId ? "Verify" : "Start"}
              </button>
            </div>

            <div className="space-y-2 border-t border-border/50 pt-3">
              <p className="text-xs font-semibold text-muted-foreground">Active authenticators</p>
              {verifiedFactors.map((factor) => (
                <div key={factor.id} className="flex items-center justify-between rounded-lg bg-background/35 px-3 py-2 text-xs">
                  <span>{factor.friendly_name || "Authenticator app"}</span>
                  <button
                    type="button"
                    onClick={() => removeFactor(factor.id)}
                    disabled={busy}
                    className="inline-flex items-center gap-1 rounded-md border border-destructive/30 px-2 py-1 text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-3 w-3" /> Remove
                  </button>
                </div>
              ))}
            </div>
          </section>
        ) : (
          <section className="space-y-4 rounded-xl border border-border/60 bg-surface/30 p-4">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-bold">
                <QrCode className="h-4 w-4 text-primary" /> Enable 2FA
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Scan the QR code with your authenticator app, then enter the 6-digit code to activate 2FA.
              </p>
            </div>

            {!newFactorQr ? (
              <button
                type="button"
                onClick={beginEnrollment}
                disabled={enrolling}
                className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-60"
              >
                {enrolling ? "Creating setup…" : "Enable 2FA"}
              </button>
            ) : (
              <div className="space-y-4">
                <div className="rounded-xl bg-white p-4">
                  <img src={newFactorQr} alt="2FA QR code" className="mx-auto h-52 w-52" />
                </div>
                <div className="rounded-lg border border-border bg-background/35 p-3">
                  <p className="text-xs text-muted-foreground">Manual setup key</p>
                  <code className="mt-1 block break-all text-xs text-primary-glow">{newFactorSecret}</code>
                </div>
                <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                  <input
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="123456"
                    className="rounded-lg border border-border bg-input px-3 py-2 text-center font-mono tracking-[0.35em]"
                  />
                  <button
                    type="button"
                    onClick={verifyEnrollment}
                    disabled={busy}
                    className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-60"
                  >
                    {busy ? "Verifying…" : "Finish Setup"}
                  </button>
                </div>
              </div>
            )}
          </section>
        )}

        <div className="mt-5 flex justify-center gap-3 text-sm">
          <Link to="/account" className="text-primary-glow hover:underline">
            Account settings
          </Link>
          <Link to="/dashboard" className="text-muted-foreground hover:text-foreground">
            Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
