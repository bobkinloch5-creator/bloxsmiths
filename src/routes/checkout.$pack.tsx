import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { Header, Footer } from "@/components/layout";
import { useAuth } from "@/lib/auth-context";
import { CREDIT_PACKS } from "@/lib/credits";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/checkout/$pack")({
  component: Checkout,
  head: () => ({
    meta: [{ title: "Checkout — BloxSmith" }, { name: "robots", content: "noindex, nofollow" }],
  }),
});

const PAYPAL_HANDLE = "kinloch930";

function Checkout() {
  const { pack } = Route.useParams();
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const p = CREDIT_PACKS.find((x) => x.id === pack);
  const [txId, setTxId] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!loading && !user) nav({ to: "/login" });
  }, [loading, user, nav]);

  if (!p)
    return (
      <div className="p-10 text-center">
        Unknown pack.{" "}
        <Link to="/pricing" className="underline">
          Back to pricing
        </Link>
      </div>
    );

  const paypalUrl = `https://www.paypal.com/paypalme/${PAYPAL_HANDLE}/${p.price}USD`;

  const submit = async () => {
    if (!user) return;
    if (txId.trim().length < 6) {
      toast.error("Enter a valid PayPal transaction ID");
      return;
    }
    setSubmitting(true);
    const { error } = await (supabase as any).from("payment_requests").insert({
      user_id: user.id,
      pack_id: p.id,
      credits: p.credits,
      amount: p.price,
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
        <h1 className="text-3xl font-bold">Checkout</h1>

        <div className="glass rounded-2xl p-6 space-y-3">
          <div className="flex justify-between">
            <span className="font-medium">{p.name}</span>
            <span className="font-semibold">${p.price}</span>
          </div>
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>Credits</span>
            <span>{p.credits}</span>
          </div>
        </div>

        <div className="glass rounded-2xl p-6 space-y-4">
          <div>
            <h2 className="font-semibold">Step 1 — Send payment</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Pay <span className="font-semibold text-foreground">${p.price} USD</span> via PayPal
              to:
            </p>
            <a
              href={paypalUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-3 block w-full text-center rounded-xl bg-[#ffc439] text-black font-semibold py-3 hover:opacity-90"
            >
              Pay ${p.price} on paypal.me/{PAYPAL_HANDLE}
            </a>
            <p className="text-xs text-muted-foreground mt-2">
              In the PayPal note, include:{" "}
              <code className="bg-surface-elevated px-1 rounded">
                {user?.email} — {p.id}
              </code>
            </p>
          </div>
        </div>

        <div className="glass rounded-2xl p-6 space-y-4">
          <div>
            <h2 className="font-semibold">Step 2 — Submit for verification</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Paste your PayPal Transaction ID from the receipt email. Credits are added after
              manual verification (usually within a few hours).
            </p>
          </div>
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
              <label htmlFor="pack-tx-id" className="sr-only">
                PayPal Transaction ID
              </label>
              <input
                id="pack-tx-id"
                aria-label="PayPal Transaction ID"
                value={txId}
                onChange={(e) => setTxId(e.target.value)}
                placeholder="PayPal Transaction ID (e.g. 7AB12345CD678901E)"
                className="w-full rounded-lg bg-surface-elevated border border-border px-3 py-2 text-sm"
              />
              <label htmlFor="pack-note" className="sr-only">
                Optional note
              </label>
              <textarea
                id="pack-note"
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
