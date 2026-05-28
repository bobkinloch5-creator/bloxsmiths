import { createFileRoute } from "@tanstack/react-router";
import { Header, Footer } from "@/components/layout";

export const Route = createFileRoute("/faq")({
  component: FAQ,
  head: () => ({
    meta: [
      { title: "FAQ — BloxSmith" },
      {
        name: "description",
        content:
          "Frequently asked questions about BloxSmith credits, payments, the Roblox Studio plugin, and AI generation.",
      },
      { property: "og:title", content: "FAQ — BloxSmith" },
      {
        property: "og:description",
        content:
          "Answers about credits, PayPal payments, the Roblox Studio plugin and AI generation.",
      },
      { property: "og:url", content: "https://bloxsmith.pro/faq" },
    ],
    links: [{ rel: "canonical", href: "https://bloxsmith.pro/faq" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: QA.map((item) => ({
            "@type": "Question",
            name: item.q,
            acceptedAnswer: { "@type": "Answer", text: item.a },
          })),
        }),
      },
    ],
  }),
});

const QA = [
  {
    q: "How do credits work?",
    a: "Every action that uses AI costs credits. Chat replies cost 1, script generation 1, system generation 3, full system 5, and a full game scaffold 12. You start with 150 free credits, plus +10 every day and promo codes and buy more whenever you need.",
  },
  {
    q: "Do you have subscriptions?",
    a: "No. BloxSmith is credit-only. You buy what you need, when you need it. No recurring charges, ever.",
  },
  {
    q: "How do I pay?",
    a: "We accept PayPal. On the checkout page, click the PayPal button to send payment to paypal.me/kinloch930, then paste your PayPal Transaction ID for verification.",
  },
  {
    q: "How long does verification take?",
    a: "Usually a few hours. Once an admin confirms your payment in PayPal, credits are added to your account automatically and you'll see them on the dashboard.",
  },
  {
    q: "What if I don't add the transaction ID?",
    a: "Credits will not be added until we can match your PayPal payment. Always submit the Transaction ID from your PayPal receipt email.",
  },
  { q: "Do credits expire?", a: "No. Credits never expire." },
  {
    q: "Can I get a refund?",
    a: "Credits already spent on AI generations are non-refundable. Unused credits from a purchase can be refunded within 7 days if requested before they're spent.",
  },
  {
    q: "How does the Roblox Studio plugin work?",
    a: "Install the BloxSmith plugin in Roblox Studio, paste your plugin token from the Account page, and click Connect. Any file the AI generates on the web is auto-synced into Studio every few seconds.",
  },
  {
    q: "Can I work with friends?",
    a: "Project sharing is currently disabled so every account stays fully private.",
  },
  {
    q: "Is BloxSmith affiliated with Roblox?",
    a: "No. BloxSmith is an independent tool. Roblox and Roblox Studio are trademarks of Roblox Corporation.",
  },
  {
    q: "What AI model do you use?",
    a: "We use Google Gemini models through a secure gateway. You don't need any API keys.",
  },
  {
    q: "Is my code private?",
    a: "Yes. Your projects, chats, generations, and saved data are private to your account.",
  },
];

function FAQ() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 mx-auto max-w-3xl w-full px-4 sm:px-6 py-16">
        <h1 className="text-4xl font-bold">Frequently asked questions</h1>
        <p className="mt-3 text-muted-foreground">
          Everything about credits, payments, the plugin, and how BloxSmith works.
        </p>
        <div className="mt-10 space-y-3">
          {QA.map((item, i) => (
            <details key={i} className="glass rounded-xl p-5 group">
              <summary className="cursor-pointer font-semibold list-none flex justify-between items-center">
                {item.q}
                <span className="text-muted-foreground group-open:rotate-45 transition">+</span>
              </summary>
              <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{item.a}</p>
            </details>
          ))}
        </div>
      </main>
      <Footer />
    </div>
  );
}
