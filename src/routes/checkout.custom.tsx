import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { Header, Footer } from "@/components/layout";
import { useAuth } from "@/lib/auth-context";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/checkout/custom")({
  component: CustomCheckout,
  head: () => ({
    meta: [
      { title: "Custom Credits — BloxSmith" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

const PAYPAL_HANDLE = "kinloch930";
export const CUSTOM_RATE = 0.05; // $0.05 per credit
const MIN_CREDITS = 50;
const MAX_CREDITS = 20000;

function CustomCheckout() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const [credits, setCredits] = useState<number>(200);
  const [txId, setTxId] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!loading && !user) nav({ to: "/login" });
  }, [loading, user, nav]);

  const safeCredits = Math.max(MIN_CREDITS, Math.min(MAX_CREDITS, Math.floor(credits || 0)));
  const price = useMemo(() => Math.round(safeCredits * CUSTOM_RATE * 100) / 100, [safeCredits]);
  const paypalUrl = `https://www.paypal.com/paypalme/${PAYPAL_HANDLE}/${price}USD`;

  const submit = async () => {
    if (!user) return;
    if (txId.trim().length < 6) {
      toast.error("Enter a valid PayPal transaction ID");
      return;
    }
    setSubmitting(true);
    const { error } = await (supabase as any).from("payment_requests").insert({
      user_id: user.id,
      pack_id: `custom_${safeCredits}`,
      credits: safeCredits,
      amount: price,
      paypal_transaction_id: txId.trim(),
      paypal_note: note.trim() || null,
      status: "pending",
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setSubmitted(true);
    toast.success("Submitted! Credits will be added after verification.");
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 mx-auto max-w-xl w-full px-4 py-12 space-y-6">
        <h1 className="text-3xl font-bold">Custom credit amount</h1>
        <p className="text-sm text-muted-foreground">
          Pick exactly how many credits you need. Rate:{" "}
          <span className="text-foreground font-semibold">${CUSTOM_RATE.toFixed(2)}</span> per
          credit.
        </p>

        <div className="glass rounded-2xl p-6 space-y-4">
          <label htmlFor="custom-credits-input" className="block text-sm font-medium">
            Credits ({MIN_CREDITS}–{MAX_CREDITS})
          </label>
          <input
            id="custom-credits-input"
            aria-label={`Number of credits to buy (between ${MIN_CREDITS} and ${MAX_CREDITS})`}
            type="number"
            min={MIN_CREDITS}
            max={MAX_CREDITS}
            step={10}
            value={credits}
            onChange={(e) => setCredits(Number(e.target.value))}
            className="w-full rounded-lg bg-surface-elevated border border-border px-3 py-2 text-base"
          />
          <label htmlFor="custom-credits-slider" className="sr-only">
            Adjust credits with slider
          </label>
          <input
            id="custom-credits-slider"
            aria-label="Adjust credits with slider"
            type="range"
            min={MIN_CREDITS}
            max={2000}
            step={10}
            value={Math.min(credits, 2000)}
            onChange={(e) => setCredits(Number(e.target.value))}
            className="w-full"
          />
          <div className="flex items-center justify-between pt-2 border-t border-border">
            <div>
              <div className="text-xs text-muted-foreground">You'll receive</div>
              <div className="text-2xl font-bold">{safeCredits.toLocaleString()} credits</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-muted-foreground">You pay</div>
              <div className="text-2xl font-bold text-primary">${price.toFixed(2)}</div>
            </div>
          </div>
        </div>

        <div className="glass rounded-2xl p-6 space-y-4">
          <h2 className="font-semibold">Step 1 — Send payment</h2>
          <p className="text-sm text-muted-foreground">
            Pay <span className="font-semibold text-foreground">${price.toFixed(2)} USD</span> via
            PayPal. The link below pre-fills the amount.
          </p>
          <a
            href={paypalUrl}
            target="_blank"
            rel="noreferrer"
            className="block w-full text-center rounded-xl bg-[#ffc439] text-black font-semibold py-3 hover:opacity-90"
          >
            Pay ${price.toFixed(2)} on paypal.me/{PAYPAL_HANDLE}
          </a>
          <p className="text-xs text-muted-foreground">
            In the PayPal note, include:{" "}
            <code className="bg-surface-elevated px-1 rounded">
              {user?.email} — {safeCredits} credits
            </code>
          </p>
        </div>

        <div className="glass rounded-2xl p-6 space-y-4">
          <h2 className="font-semibold">Step 2 — Submit for verification</h2>
          {submitted ? (
            <div className="rounded-lg border border-primary/40 bg-primary/10 p-4 text-sm">
              Your payment is pending verification. You'll see your credits update on the dashboard
              once approved.
              <div className="mt-3">
                <Link to="/dashboard" className="underline">
                  Back to dashboard
                </Link>
              </div>
            </div>
          ) : (
            <>
              <label htmlFor="custom-tx-id" className="sr-only">
                PayPal Transaction ID
              </label>
              <input
                id="custom-tx-id"
                aria-label="PayPal Transaction ID"
                value={txId}
                onChange={(e) => setTxId(e.target.value)}
                placeholder="PayPal Transaction ID (e.g. 7AB12345CD678901E)"
                className="w-full rounded-lg bg-surface-elevated border border-border px-3 py-2 text-sm"
              />
              <label htmlFor="custom-note" className="sr-only">
                Optional note
              </label>
              <textarea
                id="custom-note"
                aria-label="Optional note about the payment"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Optional note (e.g. PayPal email used)"
                className="w-full rounded-lg bg-surface-elevated border border-border px-3 py-2 text-sm min-h-[80px]"
              />
              <button
                onClick={submit}
                disabled={submitting}
                className="w-full rounded-xl bg-primary py-3 font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
              >
                {submitting ? "Submitting…" : "Submit for verification"}
              </button>
              <p className="text-xs text-muted-foreground">
                By submitting, you confirm the payment was made and agree to our{" "}
                <Link to="/terms" className="underline">
                  Terms
                </Link>
                . Fraudulent submissions result in account ban.
              </p>
            </>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
