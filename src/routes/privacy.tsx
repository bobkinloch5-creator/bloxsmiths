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

export const Route = createFileRoute("/privacy")({
  component: () => (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 mx-auto max-w-3xl px-4 sm:px-6 py-12 space-y-8">
        <header className="space-y-2">
          <h1 className="text-4xl font-bold">Privacy Policy</h1>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Last updated: {LAST_UPDATED}
          </p>
          <p className="text-sm text-muted-foreground">
            This Privacy Policy explains how BloxSmith ("BloxSmith", "we", "us", or "our") collects,
            uses, stores, and shares information when you use our website, Roblox Studio plugin, AI
            builder, and related services (collectively, the "Service"). By using the Service you
            agree to the practices described below. If you do not agree, please stop using the
            Service.
          </p>
        </header>

        <Section title="1. Who we are">
          <p>
            BloxSmith is an independent AI-assisted development tool for Roblox creators. We are not
            affiliated with, endorsed by, or sponsored by Roblox Corporation. "Roblox" and "Roblox
            Studio" are trademarks of their respective owners and are referenced here only for
            compatibility purposes.
          </p>
        </Section>

        <Section title="2. Information we collect">
          <p>We collect only what we need to operate, secure, and improve the Service:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <span className="text-foreground font-medium">Account data</span> — email, display
              name, avatar URL, optional bio, specialization, and authentication identifiers from
              email/password or Google sign-in.
            </li>
            <li>
              <span className="text-foreground font-medium">Project data</span> — project names,
              descriptions, generated scripts, files, prompts, AI conversation history, and metadata
              you create inside the Service.
            </li>
            <li>
              <span className="text-foreground font-medium">Studio plugin data</span> — when you
              install the BloxSmith plugin and connect it to a project, the plugin uploads a
              structured snapshot of the open Roblox place (instance names, classes, properties,
              scripts, and hierarchy) so the AI can build with full context. The plugin reads only
              the place currently open in Studio and only while you are connected.
            </li>
            <li>
              <span className="text-foreground font-medium">Usage data</span> — credit balances, AI
              generations, payment requests, MCP server configurations you save, and audit logs of
              plugin actions.
            </li>
            <li>
              <span className="text-foreground font-medium">Technical data</span> — IP address,
              browser/user-agent, device type, and error/diagnostic logs needed to keep the Service
              reliable.
            </li>
            <li>
              <span className="text-foreground font-medium">Payment data</span> — when you buy
              credits we collect a PayPal transaction ID, amount, and pack ID. We do{" "}
              <span className="text-foreground font-medium">not</span> store full payment card
              numbers — those are handled exclusively by PayPal.
            </li>
          </ul>
        </Section>

        <Section title="3. How we use your information">
          <ul className="list-disc pl-5 space-y-1">
            <li>To create and manage your account, projects, and credit balance.</li>
            <li>
              To run AI generations, sync changes to your Roblox Studio session, and execute the
              actions you queue.
            </li>
            <li>To process payments, prevent abuse, and detect fraud.</li>
            <li>
              To send transactional emails (account, security, payment, and support messages).
            </li>
            <li>To diagnose bugs, monitor reliability, and improve product quality.</li>
            <li>To enforce our Terms of Service and comply with legal obligations.</li>
          </ul>
          <p>
            We do <span className="text-foreground font-medium">not</span> sell or rent your
            personal data. We do not use your project files or prompts to train third-party
            foundation models.
          </p>
        </Section>

        <Section title="4. AI processing">
          <p>
            When you send a prompt, BloxSmith forwards your prompt, relevant project context, and
            (when enabled) the Studio snapshot to AI providers (currently Groq and, where
            applicable, the Lovable AI Gateway / Google Gemini and OpenAI families) so they can
            generate a response. Providers may temporarily process this data to produce the response
            and for limited abuse-prevention purposes governed by their own policies. We do not
            authorise providers to train models on your content.
          </p>
        </Section>

        <Section title="5. MCP servers and external integrations">
          <p>
            You may optionally connect external Model Context Protocol (MCP) servers (e.g. Notion,
            Linear, Atlassian) or run BloxSmith's MCP endpoint from third-party clients such as VS
            Code, Cursor, Claude Code, Codex, or Antigravity. When you do, BloxSmith stores the
            server URL and any authentication header you provide so we can call the server on your
            behalf. You can remove these integrations at any time from Settings.
          </p>
        </Section>

        <Section title="6. Legal bases (EEA / UK users)">
          <p>
            If you are located in the European Economic Area or the United Kingdom, we process your
            personal data on the following bases:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <span className="text-foreground font-medium">Contract</span> — to provide the Service
              you signed up for.
            </li>
            <li>
              <span className="text-foreground font-medium">Legitimate interest</span> — to secure
              and improve the Service and prevent abuse.
            </li>
            <li>
              <span className="text-foreground font-medium">Consent</span> — where required (e.g.
              optional analytics).
            </li>
            <li>
              <span className="text-foreground font-medium">Legal obligation</span> — to comply with
              tax, accounting, and law-enforcement requests.
            </li>
          </ul>
        </Section>

        <Section title="7. Data sharing">
          <p>We share information only with the providers required to run the Service:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              Cloud hosting and database providers (Lovable Cloud / Supabase, Cloudflare Workers).
            </li>
            <li>AI providers strictly for generating responses to your prompts.</li>
            <li>PayPal for payment processing.</li>
            <li>Email delivery providers for transactional messages.</li>
            <li>Authorities when required by valid legal process.</li>
          </ul>
          <p>
            We may disclose information in connection with a corporate transaction (merger,
            acquisition, or asset sale). We will give notice before your data becomes subject to a
            different privacy policy.
          </p>
        </Section>

        <Section title="8. Data retention">
          <p>
            We keep your account and project data for as long as your account is active. If you
            delete a project, its files and chat history are removed within 30 days. If you delete
            your account, we remove your personal data within 30 days, except for records we must
            retain for tax, billing, fraud-prevention, or legal compliance (typically up to 7 years
            for financial records).
          </p>
        </Section>

        <Section title="9. Security">
          <p>
            We protect data in transit with TLS and at rest with industry-standard encryption.
            Database access is scoped through row-level security policies so you can only access
            your own data. Plugin tokens and MCP credentials are stored as hashes or in
            restricted-access tables. No system is perfectly secure — please report suspected
            vulnerabilities to{" "}
            <a className="underline" href="mailto:community100x@gmail.com">
              community100x@gmail.com
            </a>
            .
          </p>
        </Section>

        <Section title="10. Your choices and rights">
          <p>Depending on where you live, you may have rights to:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Access, correct, or export the personal data we hold about you.</li>
            <li>Delete your account and associated personal data.</li>
            <li>Object to or restrict certain processing.</li>
            <li>Withdraw consent at any time (without affecting prior lawful processing).</li>
            <li>Lodge a complaint with your local data-protection authority.</li>
          </ul>
          <p>
            To exercise any of these rights, email{" "}
            <a className="underline" href="mailto:community100x@gmail.com">
              community100x@gmail.com
            </a>
            .
          </p>
        </Section>

        <Section title="11. Children">
          <p>
            The Service is not directed to children under 13. Users between 13 and the age of
            majority in their jurisdiction must have parental or guardian consent to use the Service
            and to make any purchase. If you believe a child has provided personal data to us
            without consent, contact us and we will delete it.
          </p>
        </Section>

        <Section title="12. International transfers">
          <p>
            BloxSmith is operated globally and your data may be processed in countries outside your
            own, including the United States and the European Union. Where required, we rely on
            Standard Contractual Clauses or equivalent safeguards.
          </p>
        </Section>

        <Section title="13. Cookies and local storage">
          <p>
            We use strictly-necessary cookies and browser local storage to keep you signed in,
            remember preferences (theme, settings, MCP configuration), and run the chat UI. We do
            not use third-party advertising cookies.
          </p>
        </Section>

        <Section title="14. Changes to this policy">
          <p>
            We may update this Privacy Policy as the Service evolves. We will update the "Last
            updated" date and, for material changes, notify you in-product or by email before they
            take effect.
          </p>
        </Section>

        <Section title="15. Contact">
          <p>
            Questions about this policy? Email{" "}
            <a className="underline" href="mailto:community100x@gmail.com">
              community100x@gmail.com
            </a>{" "}
            or write to BloxSmith, Privacy Team.
          </p>
        </Section>
      </main>
      <Footer />
    </div>
  ),
  head: () => ({
    meta: [
      { title: "Privacy Policy — BloxSmith" },
      {
        name: "description",
        content:
          "How BloxSmith collects, uses, and protects your account, project, and Roblox Studio data — and the choices you have over it.",
      },
      { property: "og:title", content: "Privacy Policy — BloxSmith" },
      {
        property: "og:description",
        content:
          "How BloxSmith handles your account, project, and Roblox Studio data, and the choices you have.",
      },
      { property: "og:url", content: "https://bloxsmith.pro/privacy" },
    ],
    links: [{ rel: "canonical", href: "https://bloxsmith.pro/privacy" }],
  }),
});
