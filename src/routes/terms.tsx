import { createFileRoute } from "@tanstack/react-router";
import { Header, Footer } from "@/components/layout";

const LAST_UPDATED = "May 26, 2026";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold text-foreground border-b border-border pb-2">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

export const Route = createFileRoute("/terms")({
  component: () => (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 mx-auto max-w-3xl px-4 sm:px-6 py-12 space-y-8">
        <header className="space-y-2">
          <h1 className="text-4xl font-bold">Terms of Service</h1>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Last updated: {LAST_UPDATED}
          </p>
          <p className="text-sm text-muted-foreground">
            Welcome to BloxSmith. These Terms of Service ("Terms") form a binding agreement between
            you and BloxSmith ("BloxSmith", "we", "us", or "our") and govern your access to and use
            of our website, AI builder, Roblox Studio plugin, MCP endpoint, and any related services
            (collectively, the "Service"). By creating an account, installing the plugin, or
            otherwise using the Service, you agree to these Terms. If you do not agree, do not use
            the Service.
          </p>
        </header>

        <Section title="1. Eligibility and accounts">
          <p>
            You must be at least 13 years old to use the Service, and old enough to form a binding
            contract under the laws of your country. If you are under the age of majority in your
            jurisdiction, you may only use the Service with the consent of a parent or legal
            guardian who agrees to be bound by these Terms on your behalf. You are responsible for
            keeping your login credentials secure and for all activity under your account.
          </p>
        </Section>

        <Section title="2. Independence from Roblox Corporation">
          <p>
            BloxSmith is an independent tool and is{" "}
            <span className="text-foreground font-medium">
              not affiliated with, endorsed by, sponsored by, or in any way officially connected to
              Roblox Corporation
            </span>
            . "Roblox" and "Roblox Studio" are trademarks of their respective owners. You are
            responsible for ensuring that your use of BloxSmith — including any content generated
            through it and any place you publish to Roblox — also complies with Roblox's Terms of
            Use, Community Standards, and Developer Terms.
          </p>
        </Section>

        <Section title="3. The Service">
          <p>
            BloxSmith provides AI-assisted generation of Roblox-compatible scripts, models, and game
            logic, plus a Studio plugin that applies queued changes to a Roblox place you open.
            Features, models, credit costs, and limits may change as the Service evolves. We may
            add, modify, suspend, or remove features at any time.
          </p>
        </Section>

        <Section title="4. Credits, purchases, and refunds">
          <ul className="list-disc pl-5 space-y-1">
            <li>
              Most AI actions consume credits from your account balance. Credit costs are shown
              before you spend them.
            </li>
            <li>
              You may buy credits through PayPal. Prices are listed on the Pricing page and may be
              updated from time to time.
            </li>
            <li>
              Credits are a limited, non-transferable license to access AI capacity. They have no
              cash value, cannot be redeemed for cash, and (except where required by law) are
              non-refundable once spent.
            </li>
            <li>
              If a generation fails due to a clear platform error, credits are automatically
              refunded.
            </li>
            <li>
              Suspected fraudulent, chargeback, or abusive transactions may result in immediate
              suspension and forfeiture of any unspent credits.
            </li>
          </ul>
        </Section>

        <Section title="5. Acceptable use">
          <p>You agree not to use the Service to:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              Violate any law, regulation, or third-party right (including Roblox's policies).
            </li>
            <li>
              Generate or distribute content that is sexual, hateful, harassing, violent, deceptive,
              malicious, or harmful to minors.
            </li>
            <li>
              Build cheats, exploits, malware, account-stealers, or anything that compromises the
              security of Roblox or other users.
            </li>
            <li>
              Reverse-engineer, scrape, or attempt to extract source code, model weights, or
              non-public prompts beyond what is exposed in the user interface.
            </li>
            <li>Resell, sublicense, or white-label BloxSmith without our written permission.</li>
            <li>
              Bypass rate limits, credit checks, or authentication, or share a single account
              between multiple unrelated users.
            </li>
            <li>Submit personal data about third parties that you are not authorised to share.</li>
          </ul>
          <p>
            We may remove content, suspend, or terminate accounts that violate these rules, with or
            without notice.
          </p>
        </Section>

        <Section title="6. Your content and licenses">
          <p>
            You retain ownership of the prompts, projects, files, and place data you submit to the
            Service ("Your Content"). You grant BloxSmith a worldwide, non-exclusive, royalty-free
            license to host, process, store, display, and transmit Your Content solely as needed to
            operate, secure, support, and improve the Service (including forwarding necessary
            context to AI providers to generate responses to you).
          </p>
          <p>
            AI-generated output ("Generations") is provided to you as-is. You are responsible for
            reviewing, testing, and adapting Generations before using them in a published Roblox
            experience. To the extent we have any rights in Generations, we assign them to you,
            subject to (a) your compliance with these Terms, and (b) similar Generations that may be
            produced for other users.
          </p>
        </Section>

        <Section title="7. Studio plugin and queued actions">
          <p>
            The BloxSmith plugin runs inside Roblox Studio under your account and applies actions
            queued by you or the AI. You can pause auto-sync, switch to manual-only sync, or
            disconnect the plugin at any time from Settings. You are solely responsible for the
            contents of any place the plugin modifies — always work on a backup before applying
            experimental changes.
          </p>
        </Section>

        <Section title="8. Third-party services and MCP">
          <p>
            The Service integrates with third-party services (Roblox Studio, PayPal, AI providers,
            MCP servers you configure). Your use of those services is governed by their own terms.
            We are not responsible for the availability, accuracy, or behaviour of third-party
            services or for any data you transmit to them.
          </p>
        </Section>

        <Section title="9. Intellectual property">
          <p>
            The BloxSmith name, logo, website, plugin, documentation, and underlying software are
            owned by us or our licensors and are protected by intellectual property laws. Except for
            the limited rights to use the Service granted in these Terms, no rights are transferred
            to you.
          </p>
        </Section>

        <Section title="10. Beta features">
          <p>
            We may label some features as beta, preview, or experimental. Such features are provided
            on an "as-is" basis, may change or be removed without notice, and may consume credits or
            behave unpredictably. Do not rely on beta features for critical workflows.
          </p>
        </Section>

        <Section title="11. Termination">
          <p>
            You may stop using the Service and delete your account at any time. We may suspend or
            terminate your access (in whole or in part) if you breach these Terms, if your use
            creates risk for us or other users, or if we are required to do so by law. On
            termination, your right to use the Service ends immediately; sections that by their
            nature should survive (ownership, disclaimers, liability, indemnity, governing law) will
            survive.
          </p>
        </Section>

        <Section title="12. Disclaimers">
          <p className="uppercase text-xs tracking-wider text-foreground">
            The service and all generations are provided "as is" and "as available" without
            warranties of any kind, whether express, implied, statutory, or otherwise, including
            warranties of merchantability, fitness for a particular purpose, non-infringement,
            accuracy, or that Generations will be error-free, compliant with Roblox policies, or
            suitable for publication.
          </p>
        </Section>

        <Section title="13. Limitation of liability">
          <p className="uppercase text-xs tracking-wider text-foreground">
            To the maximum extent permitted by law, BloxSmith will not be liable for any indirect,
            incidental, special, consequential, exemplary, or punitive damages, or any loss of
            profits, revenues, data, goodwill, or Roblox account standing, arising out of or related
            to your use of the service. Our total aggregate liability for any claim arising out of
            or related to the service will not exceed the greater of (a) the amount you paid to
            BloxSmith in the 3 months before the claim, or (b) USD $50.
          </p>
        </Section>

        <Section title="14. Indemnity">
          <p>
            You agree to defend, indemnify, and hold harmless BloxSmith and its officers, employees,
            and contractors from any claim, demand, loss, or expense (including reasonable legal
            fees) arising out of (a) Your Content, (b) your use of the Service, (c) your violation
            of these Terms, or (d) your violation of any third-party right, including Roblox's
            policies.
          </p>
        </Section>

        <Section title="15. Changes to the Terms">
          <p>
            We may update these Terms from time to time. We will update the "Last updated" date and,
            for material changes, notify you in-product or by email at least 14 days before they
            take effect. Continued use of the Service after the effective date constitutes
            acceptance of the updated Terms.
          </p>
        </Section>

        <Section title="16. Governing law and disputes">
          <p>
            These Terms are governed by the laws of the jurisdiction in which BloxSmith is operated,
            without regard to conflict-of-law principles. Disputes will be resolved in the competent
            courts of that jurisdiction, unless mandatory consumer-protection laws of your residence
            apply. Nothing in these Terms limits any non-waivable rights you have under applicable
            law.
          </p>
        </Section>

        <Section title="17. Contact">
          <p>
            Questions about these Terms? Email{" "}
            <a className="underline" href="mailto:community100x@gmail.com">
              community100x@gmail.com
            </a>
            .
          </p>
        </Section>
      </main>
      <Footer />
    </div>
  ),
  head: () => ({
    meta: [
      { title: "Terms of Service — BloxSmith" },
      {
        name: "description",
        content:
          "The terms that govern your use of BloxSmith — accounts, credits, generated Roblox content, payments, plugin behavior, and acceptable use.",
      },
      { property: "og:title", content: "Terms of Service — BloxSmith" },
      {
        property: "og:description",
        content:
          "Terms covering BloxSmith accounts, credits, generated Roblox content, payments, and acceptable use.",
      },
      { property: "og:url", content: "https://bloxsmith.pro/terms" },
    ],
    links: [{ rel: "canonical", href: "https://bloxsmith.pro/terms" }],
  }),
});
