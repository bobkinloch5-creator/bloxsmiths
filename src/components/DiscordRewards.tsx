import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { Copy, Gift, Users } from "lucide-react";

export const DISCORD_INVITE = "https://discord.gg/J9TU7syJCr";

export function DiscordRewards() {
  const { user, profile, refresh } = useAuth();
  const [claiming, setClaiming] = useState(false);
  const [applying, setApplying] = useState(false);
  const [code, setCode] = useState("");
  const [refCount, setRefCount] = useState<number>(0);

  const referralCode = (profile as any)?.referral_code as string | undefined;
  const alreadyClaimed = (profile as any)?.discord_claimed as boolean | undefined;
  const alreadyReferred = (profile as any)?.referred_by as string | null | undefined;

  const referralLink = referralCode
    ? `${typeof window !== "undefined" ? window.location.origin : "https://bloxsmith.pro"}/signup?ref=${referralCode}`
    : "";

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { count } = await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("referred_by", user.id);
      setRefCount(count ?? 0);
    })();
  }, [user]);

  const claimDiscord = async () => {
    setClaiming(true);
    const { data, error } = await (supabase as any).rpc("claim_discord_credits");
    setClaiming(false);
    if (error) return toast.error(error.message);
    if (data?.claimed) {
      toast.success(`+${data.amount} credits! Welcome to the Discord.`);
      refresh?.();
    } else {
      toast.info("You've already claimed the Discord bonus.");
    }
  };

  const applyCode = async (codeToApply?: string) => {
    const c = (codeToApply ?? code).trim();
    if (!c) return toast.error("Enter a referral code");
    setApplying(true);
    const { data, error } = await (supabase as any).rpc("apply_referral", { _code: c });
    setApplying(false);
    if (error) {
      const map: Record<string, string> = {
        invalid_code: "That referral code doesn't exist.",
        self_referral: "You can't refer yourself.",
        already_referred: "You've already used a referral code.",
      };
      return toast.error(map[error.message] ?? error.message);
    }
    if (data?.applied) {
      toast.success(`+${data.amount} credits! Your referrer also got a bonus.`);
      setCode("");
      refresh?.();
    }
  };

  // Auto-apply referral code stored from signup
  useEffect(() => {
    if (!user || alreadyReferred) return;
    const stored = typeof window !== "undefined" ? localStorage.getItem("bloxsmith_ref") : null;
    if (stored) {
      localStorage.removeItem("bloxsmith_ref");
      applyCode(stored);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, alreadyReferred]);

  return (
    <section className="rounded-2xl border border-border/50 bg-surface/20 p-6 space-y-5">
      <div className="space-y-1">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Gift className="h-5 w-5 text-primary" /> Free Credits
        </h2>
        <p className="text-sm text-muted-foreground">
          Join the Discord and invite friends to earn bonus credits.
        </p>
      </div>

      {/* Discord */}
      <div className="rounded-lg border border-[#5865F2]/30 bg-[#5865F2]/10 p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="font-semibold text-sm">Join the BloxSmith Discord</div>
            <div className="text-xs text-muted-foreground">Get +5 credits, instant.</div>
          </div>
          <a
            href={DISCORD_INVITE}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg bg-[#5865F2] hover:bg-[#4752C4] text-white px-3 py-1.5 text-xs font-semibold transition"
          >
            Join
          </a>
        </div>
        <button
          onClick={claimDiscord}
          disabled={claiming || alreadyClaimed}
          className="w-full rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground px-3 py-2 text-sm font-semibold transition disabled:opacity-50"
        >
          {alreadyClaimed ? "Claimed ✓" : claiming ? "…" : "I joined — claim +5 credits"}
        </button>
      </div>

      {/* Referrals */}
      <div className="rounded-lg border border-border/50 bg-surface-elevated/30 p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Users className="h-4 w-4 text-primary-glow" /> Refer friends — +10 each
        </div>
        <p className="text-xs text-muted-foreground">
          You and your friend both get 10 credits when they sign up with your link.
        </p>
        {referralLink && (
          <div className="flex gap-2">
            <input
              readOnly
              value={referralLink}
              className="flex-1 rounded-lg bg-surface border border-border px-3 py-2 text-xs font-mono truncate"
              onFocus={(e) => e.currentTarget.select()}
            />
            <button
              onClick={() => {
                navigator.clipboard.writeText(referralLink);
                toast.success("Referral link copied!");
              }}
              className="rounded-lg bg-primary/10 border border-primary/20 text-primary-glow hover:bg-primary/15 px-3 py-2 text-xs font-semibold transition inline-flex items-center gap-1.5"
            >
              <Copy className="h-3.5 w-3.5" /> Copy
            </button>
          </div>
        )}
        <div className="text-xs text-muted-foreground">
          Friends referred: <span className="text-foreground font-semibold">{refCount}</span>
        </div>

        {!alreadyReferred && (
          <div className="pt-2 border-t border-border/40 space-y-2">
            <label className="text-xs font-semibold text-muted-foreground">
              Have a referral code?
            </label>
            <div className="flex gap-2">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toLowerCase())}
                onKeyDown={(e) => {
                  if (e.key === "Enter") applyCode();
                }}
                placeholder="enter code"
                className="flex-1 rounded-lg bg-surface border border-border px-3 py-2 text-xs font-mono"
              />
              <button
                onClick={() => applyCode()}
                disabled={applying || !code.trim()}
                className="rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground px-3 py-2 text-xs font-semibold transition disabled:opacity-50"
              >
                {applying ? "…" : "Apply"}
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
