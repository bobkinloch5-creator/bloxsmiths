import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Header, Footer } from "@/components/layout";
import { CREDIT_PACKS } from "@/lib/credits";

export const Route = createFileRoute("/pricing")({
  component: Pricing,
  head: () => ({
    meta: [
      { title: "Simple & Fair AI Game Builder Pricing | BloxSmith" },
      {
        name: "description",
        content:
          "Simple, credit-based pricing for Roblox creators. Start building for free with daily free credits, or buy credit packs to unlock complex scripts and templates.",
      },
      {
        name: "keywords",
        content:
          "BloxSmith pricing, Roblox AI builder credits, buy Roblox script maker credits, pay as you go Roblox coding",
      },
      { property: "og:title", content: "Simple & Fair AI Game Builder Pricing | BloxSmith" },
      {
        property: "og:description",
        content:
          "Simple, credit-based pricing for Roblox creators. Start building for free with daily free credits, or buy credit packs to unlock complex scripts and templates.",
      },
      { property: "og:url", content: "https://bloxsmith.pro/pricing" },
    ],
    links: [{ rel: "canonical", href: "https://bloxsmith.pro/pricing" }],
  }),
});

function Pricing() {
  const [yearly, setYearly] = useState(false);
  const bonusMult = yearly ? 1.2 : 1; // +20% bonus credits when prepaying yearly

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 mx-auto max-w-6xl px-4 sm:px-6 py-14">
        <div className="text-center max-w-2xl mx-auto">
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">Simple, fair pricing</h1>
          <p className="mt-3 text-muted-foreground">
            Free to start. Buy credits only when you need more.
          </p>

          {/* Billing toggle */}
          <div className="mt-7 inline-flex items-center gap-1 rounded-full border border-border bg-surface p-1 text-sm">
            <button
              type="button"
              onClick={() => setYearly(false)}
              aria-pressed={!yearly}
              className={`px-4 py-1.5 rounded-full font-medium transition ${!yearly ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              Pay as you go
            </button>
            <button
              type="button"
              onClick={() => setYearly(true)}
              aria-pressed={yearly}
              className={`px-4 py-1.5 rounded-full font-medium transition inline-flex items-center gap-1.5 ${yearly ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              Yearly bundle
              <span
                className={`text-[10px] rounded-full px-1.5 py-0.5 ${yearly ? "bg-primary-foreground/20 text-primary-foreground" : "bg-success/15 text-success"}`}
              >
                +20% credits
              </span>
            </button>
          </div>
          {yearly && (
            <p className="mt-3 text-xs text-muted-foreground">
              Yearly bundles include 20% bonus credits — billed once, credits never expire.
            </p>
          )}
        </div>

        <h2 className="sr-only">Credit packs</h2>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="glass rounded-2xl p-5 flex flex-col">
            <h3 className="font-semibold">Free</h3>
            <div className="mt-2 text-2xl font-bold">$0</div>
            <div className="text-xs text-muted-foreground mt-1">150 starter + 10 daily</div>
            <p className="text-xs text-muted-foreground mt-auto pt-4">No card required.</p>
          </div>
          {CREDIT_PACKS.map((p) => {
            const popular = "popular" in p && p.popular;
            const credits = Math.round(p.credits * bonusMult);
            const perCr = (p.price / credits).toFixed(3);
            return (
              <div
                key={p.id}
                className={`glass rounded-2xl p-5 flex flex-col relative ${popular ? "ring-2 ring-primary" : ""}`}
              >
                {popular && (
                  <div className="absolute -top-2.5 left-5 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">
                    Popular
                  </div>
                )}
                {yearly && (
                  <div className="absolute -top-2.5 right-5 rounded-full bg-success/20 text-success px-2 py-0.5 text-[10px] font-semibold">
                    +20% bonus
                  </div>
                )}
                <h3 className="font-semibold">{p.name}</h3>
                <div className="mt-2 text-2xl font-bold">${p.price}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {credits} credits · ${perCr}/cr
                  {yearly && (
                    <span className="ml-1 text-muted-foreground/70 line-through">{p.credits}</span>
                  )}
                </div>
                <Link
                  to="/checkout/$pack"
                  params={{ pack: p.id }}
                  search={yearly ? ({ period: "yearly" } as never) : undefined}
                  className="mt-4 block text-center w-full rounded-lg bg-primary py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
                >
                  Buy
                </Link>
              </div>
            );
          })}
        </div>

        <div className="mt-6 glass rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h3 className="font-semibold">Custom amount</h3>
            <p className="text-sm text-muted-foreground">
              Pick exactly what you need — $0.05 / credit.
            </p>
          </div>
          <Link
            to="/checkout/custom"
            className="shrink-0 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Buy custom
          </Link>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          PayPal · credits delivered after manual verification.
        </p>
      </main>
      <Footer />
    </div>
  );
}
