import { createFileRoute, Link } from "@tanstack/react-router";
import { Header, Footer } from "@/components/layout";
import {
  Bot,
  CheckCircle,
  CreditCard,
  FileCode,
  Globe2,
  Languages,
  LayoutDashboard,
  Menu,
  Palette,
  Play,
  Server,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Wrench,
  Zap,
} from "lucide-react";

const tagStyles = {
  ai: "bg-violet-500/10 text-violet-400 border-violet-500/20",
  tools: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  backend: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  security: "bg-pink-500/10 text-pink-400 border-pink-500/20",
  plugin: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  ui: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  integrations: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
};

const changelogItems = [
  {
    version: "v2.10.0",
    date: "May 29, 2026",
    title: "AI Spend Analytics, Navigation Recovery & Theme Legibility Updates",
    description:
      "A feature-filled release introducing AI usage and spend analytics graphs, restoring navigation bar behavior across viewports, cleaning up background theme graphics, and improving 3D preview touch drag and zoom controls.",
    updates: [
      {
        category: "Analytics",
        tagColor: tagStyles.integrations,
        icon: CreditCard,
        title: "AI Spend & Usage Analytics Dashboard",
        detail:
          "Added interactive Area and Pie charts to the profile page showing total spending trends over time, spend projection, and cost breakdown per AI model alongside detailed execution logs.",
      },
      {
        category: "UI",
        tagColor: tagStyles.ui,
        icon: Smartphone,
        title: "Navigation Bar Restored",
        detail:
          "Fixed the navigation bar breakpoint rules so it remains visible and horizontally scrollable on medium/large devices (768px to 1280px) instead of disappearing.",
      },
      {
        category: "UI",
        tagColor: tagStyles.ui,
        icon: Palette,
        title: "Theme Background Cleanup",
        detail:
          "Optimized the official BloxSmith theme background SVG. Removed the busy text and overlapping card elements, making page tables and content legible across all themes.",
      },
      {
        category: "UI",
        tagColor: tagStyles.ui,
        icon: Sparkles,
        title: "3D Showcase Zoom & Touch Drag Controls",
        detail:
          "Enhanced the 3D model previewer with responsive rotation dragging and smooth pinch-to-zoom controls, optimized for both mobile touch and desktop cursor controls.",
      },
      {
        category: "Stability",
        tagColor: tagStyles.security,
        icon: ShieldCheck,
        title: "Profile Rendering Fix",
        detail:
          "Resolved the React hook execution mismatch error on the profile page, ensuring the dashboard loads correctly under all authentication and loading states.",
      },
    ],
  },
  {
    version: "v2.9.0",
    date: "May 28, 2026",
    title: "Image & Clothing Generator Overhaul",
    description:
      "A focused update fixing and polishing the creative tools: faster, more reliable image and clothing generation on Gemini, correct credit handling, a 3D clothing preview, and better downloads.",
    updates: [
      {
        category: "Tools",
        tagColor: tagStyles.tools,
        icon: Palette,
        title: "Clothing Generator Repaired",
        detail:
          "The clothing studio now generates upload-ready Roblox shirt, pants, T-shirt, and accessory textures reliably through the Gemini image pipeline, with clearer upload guidance for each garment type.",
      },
      {
        category: "Tools",
        tagColor: tagStyles.tools,
        icon: Sparkles,
        title: "Image Generator on Gemini",
        detail:
          "The AI image generator now runs entirely on Gemini image models with a single key, defaults to the newest fast model, and adds one-tap Roblox asset presets for thumbnails, game icons, HUD/UI graphics, textures, gamepass banners, and decals.",
      },
      {
        category: "Tools",
        tagColor: tagStyles.tools,
        icon: Wrench,
        title: "3D Clothing Preview",
        detail:
          "Generated clothing can now be previewed in an interactive 3D view that wraps the texture onto a rotating avatar, alongside the flat texture view, so you can sanity-check colors and placement before uploading.",
      },
      {
        category: "Credits",
        tagColor: tagStyles.backend,
        icon: CreditCard,
        title: "Credits Only Charged on Success",
        detail:
          "Clothing and image generations now charge credits only when a generation succeeds. Failed or timed-out generations are automatically refunded, so a failure never costs you credits.",
      },
      {
        category: "Performance",
        tagColor: tagStyles.backend,
        icon: Zap,
        title: "Faster, No More Hanging Generations",
        detail:
          "Image requests now have a hard timeout, so a slow or stuck request fails cleanly with a retry message instead of leaving you on an endless spinner. Loading states show real step-by-step progress.",
      },
      {
        category: "Tools",
        tagColor: tagStyles.tools,
        icon: CheckCircle,
        title: "Reliable Downloads",
        detail:
          "Download buttons for generated clothing and images now save the file directly instead of occasionally opening it in a new tab.",
      },
    ],
  },
  {
    version: "v2.8.0",
    date: "May 28, 2026",
    title: "Roblox AI Brain, Mobile Navigation & Stability Upgrade",
    description:
      "A major reliability and AI-quality update focused on making BloxSmith better at building real Roblox games, easier to use on mobile, and safer across important pages.",
    updates: [
      {
        category: "AI Brain",
        tagColor: tagStyles.ai,
        icon: Bot,
        title: "Roblox Docs Knowledge Mandate",
        detail:
          "Expanded the AI guidance so BloxSmith acts like it knows Roblox Creator Hub, Luau, Engine APIs, DataStores, MarketplaceService, TeleportService, PathfindingService, UI, animation, physics, lighting, terrain, plugins, and secure multiplayer patterns.",
      },
      {
        category: "Game Types",
        tagColor: tagStyles.ai,
        icon: Sparkles,
        title: "Any Roblox Game Type Support",
        detail:
          "Added stronger instructions for tycoons, FPS games, RPGs, simulators, obbies, horror, racing, tower defense, fighting, pet games, roleplay, city games, dungeons, quests, shops, inventories, crafting, vehicles, pets, teams, rounds, and more.",
      },
      {
        category: "Real Assets",
        tagColor: tagStyles.tools,
        icon: Play,
        title: "Real Studio Builds Over Tiny Demos",
        detail:
          "BloxSmith is now guided to build playable vertical slices with real maps/assets, UI, sounds, scripts, RemoteEvents, folders, saving when needed, and Studio edit-mode visibility instead of tiny placeholder builds.",
      },
      {
        category: "Mobile",
        tagColor: tagStyles.ui,
        icon: Menu,
        title: "Hamburger Menu Removed on Mobile",
        detail:
          "Replaced the mobile hamburger menu with a mobile-only horizontal scroll navbar so users can quickly access Home, Build, Plugin, Credits, Templates, Docs, Ideas, MCP, FAQ, 3D, and Discord.",
      },
      {
        category: "Themes",
        tagColor: tagStyles.ui,
        icon: Palette,
        title: "Better Mobile Theme Switcher",
        detail:
          "Theme switching now opens a phone-friendly panel with bigger tap targets, a close button, overlay, scroll lock, and cleaner mobile spacing while keeping desktop controls working normally.",
      },
      {
        category: "Languages",
        tagColor: tagStyles.ui,
        icon: Languages,
        title: "Better Mobile Language Switcher",
        detail:
          "Language switching now opens a mobile-friendly panel with popular languages first, more languages below, bigger tap targets, a close button, overlay, and page scroll lock while choosing a language.",
      },
      {
        category: "Help Chat",
        tagColor: tagStyles.backend,
        icon: Globe2,
        title: "Desktop Help Chat Reliability",
        detail:
          "Improved the public help chat route with model fallbacks, Groq fallback support, safe local answers, timeouts, rate limiting, and better help for plugin setup, credits, MCP, docs, and BloxSmith info.",
      },
      {
        category: "Admin",
        tagColor: tagStyles.backend,
        icon: LayoutDashboard,
        title: "Safer Admin Page",
        detail:
          "Rebuilt the admin page into a safer overview with login/admin messages, safe counts for users/projects/generations/pending payments, recent users, mobile-friendly scrolling tables, and fewer crash points.",
      },
      {
        category: "Stability",
        tagColor: tagStyles.security,
        icon: ShieldCheck,
        title: "Emergency Assistant Route Recovery",
        detail:
          "Restored the assistant execute route with safe JSON responses and fallback Studio actions so broken AI gateway calls do not crash pages or project sync flows.",
      },
    ],
  },
  {
    version: "v2.7.0",
    date: "May 28, 2026",
    title: "Premium Homepage, Mobile UX & Creator Conversion Upgrade",
    description:
      "A major homepage and mobile-friendly update focused on making BloxSmith easier to understand, more trustworthy for Roblox creators, and stronger at converting visitors into builders.",
    updates: [
      {
        category: "Homepage",
        tagColor: tagStyles.ui,
        icon: Sparkles,
        title: "What BloxSmith Can Make",
        detail:
          "Added clear sections for maps, Luau scripts, game systems, GUIs, VFX, sounds, toolbox assets, NPCs, thumbnails, icons, decals, and Roblox-ready game art.",
      },
      {
        category: "Prompts",
        tagColor: tagStyles.ai,
        icon: Bot,
        title: "Example Prompt Section",
        detail:
          "Added example prompts for tycoons, simulators, obbies, horror systems, racing lobbies, shop GUIs, and other Roblox builds so users know what to ask.",
      },
      {
        category: "Plugin",
        tagColor: tagStyles.plugin,
        icon: Play,
        title: "Roblox Studio Plugin Preview",
        detail:
          "Added plugin preview content explaining account connection, Studio sync, correct service placement, project scans, error fixing, and toolbox asset insertion.",
      },
      {
        category: "Credits",
        tagColor: tagStyles.backend,
        icon: CreditCard,
        title: "Clearer Credit Info",
        detail:
          "Added clearer credit copy explaining starter credits, daily credits, pay-as-you-go packs, and what credits are used for.",
      },
      {
        category: "Mobile",
        tagColor: tagStyles.ui,
        icon: Smartphone,
        title: "Homepage Mobile Improvements",
        detail:
          "Improved mobile hero sizing, button layout, comparison table scrolling, help chat sizing, and phone-friendly navigation spacing.",
      },
    ],
  },
  {
    version: "v2.6.0",
    date: "May 28, 2026",
    title: "Security, Speed & AI Gateway Upgrade",
    description:
      "A stability and safety release for the website, AI chat, model gateway, plugin organizer, and image generation workflow.",
    updates: [
      {
        category: "Performance",
        tagColor: tagStyles.backend,
        icon: Zap,
        title: "Smoother AI Chat Performance",
        detail:
          "Assistant messages were optimized so long chats re-render less and project pages feel smoother.",
      },
      {
        category: "Security",
        tagColor: tagStyles.security,
        icon: ShieldCheck,
        title: "Safer Provider Keys",
        detail:
          "Server AI providers and model tests now rely on environment variables instead of embedded fallback keys.",
      },
      {
        category: "AI Gateway",
        tagColor: tagStyles.integrations,
        icon: Server,
        title: "Cleaner Provider Routing",
        detail:
          "Improved routing and fallback behavior for Groq, Neokens, Gemini, OpenAI-compatible, and Claude-style providers.",
      },
    ],
  },
  {
    version: "v2.5.0",
    date: "May 27, 2026",
    title: "Full Roblox Creation Assistant",
    description:
      "BloxSmith AI evolved from a script generator into a complete Roblox build assistant for maps, GUIs, tools, VFX, systems, and Studio placement.",
    updates: [
      {
        category: "AI",
        tagColor: tagStyles.ai,
        icon: Wrench,
        title: "Build Modes Added",
        detail:
          "Added stronger generation support for animations, VFX, game systems, procedural builds, toolbox finding, and finish-my-game workflows.",
      },
      {
        category: "Placement",
        tagColor: tagStyles.backend,
        icon: FileCode,
        title: "Correct Studio Service Placement",
        detail:
          "Generated items are guided toward Workspace, ServerScriptService, ReplicatedStorage, StarterGui, StarterPack, Lighting, SoundService, Teams, and clean folders.",
      },
    ],
  },
];

export const Route = createFileRoute("/changelog")({
  component: ChangelogPage,
  head: () => ({
    meta: [
      { title: "Changelog — BloxSmith" },
      {
        name: "description",
        content:
          "Stay updated with the latest BloxSmith releases, AI upgrades, plugin changes, security fixes, mobile improvements, and Roblox builder updates.",
      },
      { property: "og:title", content: "Changelog — BloxSmith" },
      {
        property: "og:description",
        content: "Latest BloxSmith releases, features, security updates, and fixes.",
      },
      { property: "og:url", content: "https://bloxsmith.pro/changelog" },
    ],
    links: [{ rel: "canonical", href: "https://bloxsmith.pro/changelog" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Blog",
          name: "BloxSmith Changelog",
          url: "https://bloxsmith.pro/changelog",
          blogPost: changelogItems.slice(0, 4).map((item) => ({
            "@type": "BlogPosting",
            headline: item.title,
            description: item.description,
            datePublished: item.date,
            author: { "@type": "Organization", name: "BloxSmith" },
            url: `https://bloxsmith.pro/changelog#${item.version.replace(/\./g, "-")}`,
          })),
        }),
      },
    ],
  }),
});

function ChangelogPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      <main className="flex-1 max-w-4xl mx-auto w-full px-4 sm:px-6 py-16">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <div className="inline-flex items-center gap-1.5 rounded-full glass px-3 py-1 text-xs text-muted-foreground mb-4">
            <Sparkles className="h-3 w-3 text-primary-glow" /> BloxSmith updates
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight">
            What's <span className="gradient-text">New</span>
          </h1>
          <p className="mt-4 text-muted-foreground text-base sm:text-lg">
            Follow the latest website upgrades, AI improvements, Roblox Studio plugin changes,
            mobile fixes, security updates, and platform changelogs.
          </p>
        </div>

        <h2 className="sr-only">Release timeline</h2>
        <div className="space-y-16 relative before:absolute before:inset-0 before:left-4 sm:before:left-1/2 before:w-px before:-translate-x-1/2 before:bg-border/60 before:h-full">
          {changelogItems.map((item) => (
            <div
              id={item.version.replace(/\./g, "-")}
              key={item.version}
              className="relative flex flex-col sm:flex-row items-start sm:gap-12 group scroll-mt-24"
            >
              <div className="absolute left-4 sm:left-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-surface border-2 border-primary grid place-items-center z-10 shadow-lg group-hover:scale-110 transition-transform">
                <CheckCircle className="h-4 w-4 text-primary" />
              </div>

              <div className="pl-12 sm:pl-0 sm:w-1/2 sm:text-right pt-1.5 flex sm:flex-col items-baseline sm:items-end gap-2 justify-start">
                <span className="text-xl sm:text-2xl font-black text-foreground">
                  {item.version}
                </span>
                <span className="text-xs font-semibold text-muted-foreground/80 bg-surface px-2.5 py-1 rounded-full border border-border">
                  {item.date}
                </span>
              </div>

              <div className="pl-12 sm:pl-0 sm:w-1/2 mt-4 sm:mt-0">
                <div className="glass rounded-2xl p-6 sm:p-8 hover:border-primary/30 transition-all duration-300">
                  <h3 className="text-lg sm:text-xl font-bold tracking-tight mb-2 text-foreground/90">
                    {item.title}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed mb-6">
                    {item.description}
                  </p>

                  <div className="space-y-6">
                    {item.updates.map((upd, uIdx) => {
                      const Icon = upd.icon;
                      return (
                        <div key={uIdx} className="flex gap-4 items-start">
                          <div className="flex-shrink-0 h-9 w-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary-glow">
                            <Icon className="h-4.5 w-4.5" />
                          </div>
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-semibold text-foreground">
                                {upd.title}
                              </span>
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider ${upd.tagColor}`}
                              >
                                {upd.category}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                              {upd.detail}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-20 text-center glass rounded-2xl p-8 max-w-xl mx-auto">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 border border-primary/20 text-primary-glow mb-4">
            <Palette className="h-5 w-5" />
          </div>
          <h4 className="text-lg font-bold">Have suggestions or issues?</h4>
          <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
            BloxSmith is updated often to improve Roblox development workflows, plugin reliability,
            AI generation quality, mobile UX, and security.
          </p>
          <div className="mt-6 flex justify-center gap-4">
            <Link
              to="/plugin"
              className="text-xs font-semibold text-primary hover:text-primary-glow underline"
            >
              Download Latest Plugin
            </Link>
            <span className="text-muted-foreground">·</span>
            <Link
              to="/docs"
              className="text-xs font-semibold text-primary hover:text-primary-glow underline"
            >
              Read the Docs
            </Link>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
