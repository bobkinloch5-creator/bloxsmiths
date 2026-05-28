import { createFileRoute } from "@tanstack/react-router";
import { Header, Footer } from "@/components/layout";

export const Route = createFileRoute("/docs")({
  component: Docs,
  head: () => ({
    meta: [
      { title: "Docs — BloxSmith" },
      {
        name: "description",
        content: "BloxSmith documentation, plugin setup and Roblox AI builder guides.",
      },
      { property: "og:title", content: "Docs — BloxSmith" },
      {
        property: "og:description",
        content: "Guides for building Roblox games with BloxSmith AI and the Studio plugin.",
      },
      { property: "og:url", content: "https://bloxsmith.pro/docs" },
    ],
    links: [{ rel: "canonical", href: "https://bloxsmith.pro/docs" }],
  }),
});

function Docs() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 mx-auto max-w-3xl px-4 sm:px-6 py-12 prose prose-invert">
        <h1 className="text-4xl font-bold">BloxSmith Documentation</h1>
        <h2 className="mt-8 text-2xl font-semibold">Getting started</h2>
        <ol className="mt-3 space-y-2 text-muted-foreground">
          <li>1. Sign up and grab your 150 starter credits.</li>
          <li>
            2. Click <strong>New Roblox Game</strong> on your dashboard.
          </li>
          <li>3. Describe your game to the AI chat builder.</li>
          <li>4. Approve generated files in the editor.</li>
          <li>
            5. Install the{" "}
            <a
              href="https://create.roblox.com/store/asset/88358540564597"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary-glow hover:underline"
            >
              BloxSmith AI plugin
            </a>{" "}
            from the Creator Store and sync.
          </li>
        </ol>
        <h2 className="mt-8 text-2xl font-semibold">How credits work</h2>
        <p className="text-muted-foreground">
          Each generation costs credits (1 for small scripts, 3–5 for systems, 10+ for full game
          templates). Failed generations are never charged. Free accounts get get +10 free credits
          every day.
        </p>
        <h2 className="mt-8 text-2xl font-semibold">Plugin installation</h2>
        <p className="text-muted-foreground">
          See the{" "}
          <a href="/plugin" className="text-primary-glow hover:underline">
            Plugin Setup
          </a>{" "}
          page for step-by-step instructions. The easiest way is to grab the plugin directly from
          the Roblox Creator Store.
        </p>
        <h2 className="mt-8 text-2xl font-semibold">Fixing Roblox Studio errors</h2>
        <p className="text-muted-foreground">
          When the plugin sends an error, BloxSmith locates the file, explains the problem, and
          proposes a diff you can approve.
        </p>
      </main>
      <Footer />
    </div>
  );
}
