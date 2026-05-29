import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Eye, EyeOff, KeyRound, Loader2, LockKeyhole, QrCode, ShieldCheck, Trash2 } from "lucide-react";

type TotpFactor = {
  id: string;
  friendly_name?: string;
  factor_type: "totp";
  status: "verified" | "unverified";
  created_at?: string;
};

export function AccountSecurity() {
  const [busy, setBusy] = useState(false);
  const [factors, setFactors] = useState<TotpFactor[]>([]);
  const [selectedFactorId, setSelectedFactorId] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [enrolling, setEnrolling] = useState(false);
  const [newFactorId, setNewFactorId] = useState("");
  const [newFactorSecret, setNewFactorSecret] = useState("");
  const [newFactorQr, setNewFactorQr] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const verifiedFactors = useMemo(
    () => factors.filter((factor) => factor.status === "verified"),
    [factors],
  );

  const has2fa = verifiedFactors.length > 0;

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
    void loadFactors();
  }, []);

  const beginEnrollment = async () => {
    setEnrolling(true);
    setMfaCode("");
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
    const cleanCode = mfaCode.trim().replace(/\s/g, "");
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

    toast.success("2FA is now enabled on your account.");
    setMfaCode("");
    setNewFactorId("");
    setNewFactorSecret("");
    setNewFactorQr("");
    await loadFactors();
  };

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
    const cleanCode = mfaCode.trim().replace(/\s/g, "");
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

    toast.success("2FA verified successfully.");
    setMfaCode("");
    setChallengeId("");
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

  const changePassword = async () => {
    if (newPassword.length < 8) return toast.error("Password must be at least 8 characters.");
    if (newPassword !== confirmPassword) return toast.error("Passwords do not match.");

    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setBusy(false);
    if (error) return toast.error(error.message);

    setNewPassword("");
    setConfirmPassword("");
    toast.success("Password changed successfully.");
  };

  return (
    <section className="rounded-2xl border border-border/50 bg-surface/20 p-6 space-y-5">
      <div>
        <h2 className="text-lg font-bold flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" /> Account Security
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Set up two-factor authentication and update your password from your profile.
        </p>
      </div>

      <div className="rounded-xl border border-border/50 bg-surface-elevated/20 p-4 space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-sm font-bold flex items-center gap-2">
              <QrCode className="h-4 w-4 text-primary-glow" /> Two-Factor Authentication
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {has2fa
                ? "2FA is enabled. Users will need their authenticator code after login."
                : "Add an authenticator app like Google Authenticator, Authy, or 1Password."}
            </p>
          </div>
          <span
            className={`w-fit rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${
              has2fa
                ? "border-success/30 bg-success/10 text-success"
                : "border-amber-500/30 bg-amber-500/10 text-amber-300"
            }`}
          >
            {has2fa ? "Enabled" : "Not enabled"}
          </span>
        </div>

        {!has2fa && !newFactorQr && (
          <button
            type="button"
            onClick={beginEnrollment}
            disabled={enrolling || busy}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
          >
            {enrolling ? "Creating setup…" : "Enable 2FA"}
          </button>
        )}

        {newFactorQr && (
          <div className="space-y-4 rounded-xl border border-primary/20 bg-primary/5 p-4">
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
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
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

        {has2fa && (
          <div className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
              <select
                value={selectedFactorId}
                onChange={(e) => setSelectedFactorId(e.target.value)}
                className="rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm"
              >
                {verifiedFactors.map((factor) => (
                  <option key={factor.id} value={factor.id}>
                    {factor.friendly_name || "Authenticator app"}
                  </option>
                ))}
              </select>
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="123456"
                className="rounded-lg border border-border bg-input px-3 py-2 text-center font-mono tracking-[0.35em]"
              />
              <button
                type="button"
                onClick={() => (challengeId ? verifyChallenge() : startChallenge())}
                disabled={busy}
                className="rounded-lg bg-primary/10 border border-primary/20 px-4 py-2 text-sm font-bold text-primary-glow disabled:opacity-60"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : challengeId ? "Verify" : "Test"}
              </button>
            </div>

            <div className="space-y-2 border-t border-border/50 pt-3">
              <p className="text-xs font-semibold text-muted-foreground">Active authenticators</p>
              {verifiedFactors.map((factor) => (
                <div key={factor.id} className="flex items-center justify-between gap-3 rounded-lg bg-background/35 px-3 py-2 text-xs">
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
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border/50 bg-surface-elevated/20 p-4 space-y-4">
        <div>
          <h3 className="text-sm font-bold flex items-center gap-2">
            <LockKeyhole className="h-4 w-4 text-primary-glow" /> Change Password
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Use a strong password with at least 8 characters.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">New password</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                className="w-full rounded-lg border border-border bg-input px-3 py-2 pr-10 text-sm"
                placeholder="New password"
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:text-foreground"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">Confirm password</label>
            <input
              type={showPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm"
              placeholder="Confirm password"
            />
          </div>
        </div>

        <button
          type="button"
          onClick={changePassword}
          disabled={busy || !newPassword || !confirmPassword}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
        >
          <KeyRound className="h-4 w-4" /> Change Password
        </button>
      </div>
    </section>
  );
}
