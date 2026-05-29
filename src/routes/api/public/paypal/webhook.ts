import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// NOTE: PayPal IPN/webhook verification requires PAYPAL_WEBHOOK_ID + transmission headers.
// This handler verifies via PayPal's verify-webhook-signature endpoint when secrets are configured.

const PACKS: Record<string, { credits: number; price: number }> = {
  starter: { credits: 100, price: 5 },
  builder: { credits: 350, price: 15 },
  pro: { credits: 900, price: 35 },
  studio: { credits: 2200, price: 79 },
};

async function getAccessToken(): Promise<string | null> {
  const id = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  const base = process.env.PAYPAL_BASE_URL ?? "https://api-m.paypal.com";
  if (!id || !secret) return null;
  const res = await fetch(`${base}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${id}:${secret}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const j = (await res.json()) as any;
  return j.access_token ?? null;
}

export const Route = createFileRoute("/api/public/paypal/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawBody = await request.text();
        const headers = Object.fromEntries(request.headers.entries());
        const webhookId = process.env.PAYPAL_WEBHOOK_ID;
        const base = process.env.PAYPAL_BASE_URL ?? "https://api-m.paypal.com";

        // Signature verification is REQUIRED. Refuse if not configured.
        if (!webhookId) {
          return new Response("webhook not configured", { status: 503 });
        }
        const token = await getAccessToken();
        if (!token) return new Response("misconfigured", { status: 503 });
        const verifyRes = await fetch(`${base}/v1/notifications/verify-webhook-signature`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            auth_algo: headers["paypal-auth-algo"],
            cert_url: headers["paypal-cert-url"],
            transmission_id: headers["paypal-transmission-id"],
            transmission_sig: headers["paypal-transmission-sig"],
            transmission_time: headers["paypal-transmission-time"],
            webhook_id: webhookId,
            webhook_event: JSON.parse(rawBody),
          }),
        });
        const ver = (await verifyRes.json()) as any;
        if (ver.verification_status !== "SUCCESS") {
          return new Response("invalid", { status: 401 });
        }

        const event = JSON.parse(rawBody);
        if (
          event.event_type !== "CHECKOUT.ORDER.APPROVED" &&
          event.event_type !== "PAYMENT.CAPTURE.COMPLETED"
        ) {
          return new Response("ignored", { status: 200 });
        }
        const customId: string =
          event.resource?.custom_id ?? event.resource?.purchase_units?.[0]?.custom_id ?? "";
        const [userId, packId] = customId.split(":");
        const pack = PACKS[packId];
        const amount = Number(
          event.resource?.amount?.value ?? event.resource?.purchase_units?.[0]?.amount?.value ?? 0,
        );
        if (!userId || !pack) return new Response("bad ref", { status: 400 });
        // Verify the captured amount matches the declared pack price (prevent under-pay credit grants)
        if (Math.abs(amount - pack.price) > 0.01) {
          return new Response("amount mismatch", { status: 400 });
        }
        const providerPaymentId: string | null = event.resource?.id ?? null;
        // Idempotency: skip if we've already processed this provider_payment_id
        if (providerPaymentId) {
          const { data: existing } = await (supabaseAdmin as any)
            .from("payments")
            .select("id")
            .eq("provider_payment_id", providerPaymentId)
            .maybeSingle();
          if (existing) return new Response("duplicate", { status: 200 });
        }
        await (supabaseAdmin as any).from("payments").insert({
          user_id: userId,
          provider: "paypal",
          provider_payment_id: providerPaymentId,
          amount,
          status: "completed",
          credits_added: pack.credits,
          raw: event,
        });
        // Atomic credit grant via service-role RPC
        await (supabaseAdmin as any).rpc("grant_credits_service", {
          _user_id: userId,
          _amount: pack.credits,
          _reason: `PayPal ${packId} pack`,
        });
        return new Response("ok", { status: 200 });
      },
    },
  },
});
