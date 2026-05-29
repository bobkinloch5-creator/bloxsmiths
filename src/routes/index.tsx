import { Fragment } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Header, Footer } from "@/components/layout";
import heroBg from "@/assets/roblox-hero.png";
import logo from "@/assets/logo.png";
import showcaseWorld from "@/assets/showcase-tycoon.png";
import showcaseCharacters from "@/assets/showcase-rpg.png";
import showcaseObby from "@/assets/showcase-obby-new.png";
import {
  ArrowRight,
  Bot,
  Brain,
  CheckCircle2,
  Clock,
  Code2,
  CreditCard,
  Eye,
  FileCode,
  Gamepad2,
  GitFork,
  Heart,
  Image,
  Layers,
  Map,
  MessageSquare,
  Package,
  Palette,
  Play,
  Plug,
  Rocket,
  Send,
  Shield,
  Smartphone,
  Sparkles,
  Star,
  Terminal,
  Trophy,
  Users,
  Wand2,
  Wrench,
  Zap,
} from "lucide-react";
import { CREDIT_PACKS } from "@/lib/credits";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getPublicStats } from "@/lib/stats.functions";
import { getFeaturedCreator } from "@/lib/showcase.functions";

export const Route = createFileRoute("/")({
  component: Landing,
  head: () => ({
    meta: [
      { title: "BloxSmith — Build Roblox Games with AI | Script & Map Generator" },
      {
        name: "description",
        content:
          "Describe your Roblox game idea and get ready-to-play Roblox builds. BloxSmith AI generates Luau scripts, UI, maps, systems, and syncs directly into Roblox Studio.",
      },
      {
        name: "keywords",
        content:
          "Roblox AI builder, Roblox script generator, Roblox map maker, AI Luau coder, BloxSmith, Roblox Studio sync plugin",
      },
      {
        property: "og:title",
        content: "BloxSmith — Build Roblox Games with AI | Script & Map Generator",
      },
      {
        property: "og:description",
        content:
          "Describe your Roblox game idea and get ready-to-play Roblox builds. BloxSmith AI generates Luau scripts, UI, maps, systems, and syncs directly into Roblox Studio.",
      },
      { property: "og:url", content: "https://bloxsmith.pro/" },
    ],
    links: [{ rel: "canonical", href: "https://bloxsmith.pro/" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "BloxSmith",
          url: "https://bloxsmith.pro/",
          potentialAction: {
            "@type": "SearchAction",
            target: "https://bloxsmith.pro/docs?q={search_term_string}",
            "query-input": "required name=search_term_string",
          },
        }),
      },
    ],
  }),
});

const showcase = [
  {
    img: showcaseWorld,
    title: "Space Tycoon",
    desc: "Factory buttons, conveyors, rebirths, pets, and leaderstats.",
  },
  {
    img: showcaseCharacters,
    title: "Open World RPG",
    desc: "NPCs, quests, combat, inventory, and progression systems.",
  },
  {
    img: showcaseObby,
    title: "Challenging Obby",
    desc: "Checkpoints, hazards, stages, rewards, and movement mechanics.",
  },
];

const canMake = [
  {
    icon: Map,
    title: "Maps & Worlds",
    desc: "Lobbies, obbies, cities, caves, simulators, tycoons, and themed worlds.",
  },
  {
    icon: Code2,
    title: "Luau Scripts",
    desc: "Server scripts, LocalScripts, ModuleScripts, RemoteEvents, and clean game logic.",
  },
  {
    icon: Layers,
    title: "Game Systems",
    desc: "Coins, shops, inventory, pets, quests, rebirths, saving, teams, rounds, and more.",
  },
  {
    icon: Palette,
    title: "GUIs & Menus",
    desc: "Premium ScreenGuis, shops, HUDs, buttons, popups, and animated UI flows.",
  },
  {
    icon: Zap,
    title: "VFX & Sounds",
    desc: "Particles, lighting, effects, sound cues, reward bursts, and polish.",
  },
  {
    icon: Package,
    title: "Toolbox Assets",
    desc: "Find and insert free Roblox assets, props, models, maps, icons, and tools.",
  },
  {
    icon: Bot,
    title: "NPCs & Enemies",
    desc: "Quest givers, shopkeepers, zombies, guards, pets, and AI behavior scripts.",
  },
  {
    icon: Image,
    title: "Thumbnails & Icons",
    desc: "Roblox-ready game art, decals, badges, posters, and promo images.",
  },
];

const promptIdeas = [
  "Make me a mining simulator with ores, backpacks, coins, pets, and upgrades",
  "Create a racing lobby with countdowns, checkpoints, laps, and rewards",
  "Build a premium shop GUI with coins, boosts, passes, and animated buttons",
  "Add an obby checkpoint system with stages, kill bricks, and a winner badge",
  "Make a horror game flashlight, door system, chase NPC, and scary atmosphere",
  "Create a tycoon starter kit with buttons, droppers, rebirths, and saving",
];

const builderModes = [
  {
    icon: Wand2,
    title: "Full Game Builder",
    desc: "Turn one idea into a full Roblox project plan and playable systems.",
  },
  {
    icon: Code2,
    title: "Script Builder",
    desc: "Generate clean Luau code for tools, systems, events, and services.",
  },
  {
    icon: Map,
    title: "Map Builder",
    desc: "Create layouts, scenery, folders, lighting, terrain ideas, and asset plans.",
  },
  {
    icon: Palette,
    title: "GUI Builder",
    desc: "Build polished menus, shops, HUDs, popups, and animated UI.",
  },
  {
    icon: Zap,
    title: "VFX Builder",
    desc: "Add particles, sounds, glow, explosions, reward effects, and atmosphere.",
  },
  {
    icon: Wrench,
    title: "Game Fixer",
    desc: "Paste errors or describe bugs and get safe fixes fast.",
  },
];

const trustBadges = [
  { icon: Sparkles, label: "Free to start" },
  { icon: Shield, label: "No card needed" },
  { icon: Plug, label: "Roblox Studio plugin" },
  { icon: CreditCard, label: "Daily free credits" },
  { icon: Code2, label: "Built for Luau" },
  { icon: Users, label: "Beginner friendly" },
];

const liveDemoFlow = [
  {
    icon: MessageSquare,
    title: "Prompt",
    desc: "Make me a mining simulator with ores, backpacks, pets, and upgrades.",
  },
  {
    icon: Brain,
    title: "AI plan",
    desc: "BloxSmith designs the services, folders, remotes, data, GUI, and gameplay loop.",
  },
  {
    icon: FileCode,
    title: "Generated files",
    desc: "Server scripts, LocalScripts, modules, UI actions, and test steps are created.",
  },
  {
    icon: Send,
    title: "Studio sync",
    desc: "The plugin places the build into Roblox Studio so you can test faster.",
  },
];

const pluginPreview = [
  "Connects your BloxSmith account",
  "Sends scripts into Roblox Studio",
  "Places files in the right services",
  "Scans your project for better context",
  "Helps fix Studio errors",
  "Inserts toolbox assets safely",
];

const beginnerWins = [
  "No scripting experience needed",
  "Plain-English prompts work",
  "Explains where everything goes",
  "Helps you test and fix errors",
];

const painPoints = [
  "Stop spending hours searching tutorials.",
  "Stop fighting broken copy-paste scripts.",
  "Stop guessing where files belong in Studio.",
  "Build, organize, test, and improve faster.",
];

const comingSoon = [
  {
    icon: Brain,
    title: "Smarter project scanner",
    desc: "Deeper project awareness so BloxSmith understands your game better.",
  },
  {
    icon: Image,
    title: "AI thumbnail generator",
    desc: "Create Roblox-ready icons, thumbnails, decals, badges, and promo art.",
  },
  {
    icon: Package,
    title: "Better toolbox search",
    desc: "Find safer, cleaner, more useful free marketplace assets.",
  },
  {
    icon: Users,
    title: "Team project building",
    desc: "Invite friends and build together inside shared BloxSmith projects.",
  },
  {
    icon: CreditCard,
    title: "More payment options",
    desc: "More ways to buy credits and keep building without friction.",
  },
];

const comparison = [
  [
    "Made for Roblox",
    "Yes — Roblox Studio, Luau, services, and plugin workflow",
    "Generic coding only",
  ],
  [
    "Studio plugin",
    "Sync generated files and actions into the right Roblox services",
    "Manual copy/paste",
  ],
  ["Toolbox assets", "Find, scan, and insert free Roblox assets", "Not built in"],
  [
    "Project awareness",
    "Can use project memory and scanner context",
    "Usually no live Studio context",
  ],
  ["Builder modes", "Maps, scripts, GUI, VFX, full game, fixer", "One general chat"],
];

const features = [
  {
    icon: Bot,
    title: "AI Roblox Game Builder",
    desc: "Describe a game idea and get real playable Roblox systems — not random snippets.",
  },
  {
    icon: Plug,
    title: "Roblox Studio Plugin",
    desc: "Push scripts, models, UI, and actions into Studio with the plugin.",
  },
  {
    icon: Brain,
    title: "Project Memory",
    desc: "BloxSmith remembers your project and helps continue your build.",
  },
  {
    icon: Wrench,
    title: "Error Fixing",
    desc: "Send Studio errors back and get a clear fix in seconds.",
  },
  {
    icon: CreditCard,
    title: "Free Credits + PayPal",
    desc: "Start free, get daily credits, and buy more when you need them.",
  },
  {
    icon: Smartphone,
    title: "Mobile Friendly",
    desc: "Plan, chat, manage, and review projects from phone, tablet, or desktop.",
  },
];

const steps = [
  {
    icon: MessageSquare,
    title: "Describe your idea",
    desc: "Tell BloxSmith what Roblox game, map, GUI, or system you want.",
  },
  {
    icon: Brain,
    title: "AI plans the build",
    desc: "It decides the scripts, services, files, assets, and structure.",
  },
  {
    icon: Send,
    title: "Sync to Studio",
    desc: "Use the plugin to place everything into the correct Roblox Studio locations.",
  },
  {
    icon: Wrench,
    title: "Test and fix",
    desc: "Send errors back, get fixes, and keep building until it works.",
  },
];

const gameTypes = [
  "Tycoon",
  "Simulator",
  "Obby",
  "Pet Game",
  "RPG",
  "Tower Defense",
  "Horror",
  "Roleplay",
  "Racing",
  "Story Game",
  "Sandbox",
  "Fighting",
];

const testimonials = [
  {
    name: "Bob Kinloch",
    role: "Lead Creator",
    body: "Using BloxSmith, I was able to build and launch my Roblox game in record time. The AI generates clean Luau code instantly.",
    rating: 5,
  },
  {
    name: "Mira S.",
    role: "Studio lead",
    body: "Cut our prototyping time by 80%. BloxSmith makes prototyping feel instant.",
    rating: 5,
  },
  {
    name: "Devon P.",
    role: "Hobbyist",
    body: "I built my first real game. The error-fix loop is what sold me.",
    rating: 5,
  },
];

const fallbackStats = [
  { value: "12k+", label: "Scripts generated" },
  { value: "850+", label: "Games started" },
  { value: "60s", label: "Idea → playable" },
  { value: "4.9★", label: "Creator rating" },
];

function compact(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k+`;
  if (n >= 100) return `${Math.floor(n / 10) * 10}+`;
  return `${n}`;
}

function useLiveStats() {
  const fetchStats = useServerFn(getPublicStats);
  return useQuery({
    queryKey: ["public-stats"],
    queryFn: () => fetchStats({}),
    staleTime: 5 * 60_000,
  });
}

function useFeaturedCreator() {
  const fetchFeatured = useServerFn(getFeaturedCreator);
  return useQuery({
    queryKey: ["featured-creator"],
    queryFn: () => fetchFeatured(),
    staleTime: 10 * 60_000,
  });
}

function SectionTitle({
  badge,
  title,
  desc,
  icon: Icon,
}: {
  badge: string;
  title: string;
  desc?: string;
  icon: any;
}) {
  return (
    <div className="max-w-2xl mx-auto text-center">
      <div className="inline-flex items-center gap-1.5 rounded-full glass px-3 py-1 text-xs text-muted-foreground">
        <Icon className="h-3 w-3 text-primary-glow" /> {badge}
      </div>
      <h2 className="mt-4 text-2xl sm:text-4xl font-bold tracking-tight">{title}</h2>
      {desc && <p className="text-muted-foreground mt-3 text-sm sm:text-base">{desc}</p>}
    </div>
  );
}

function Landing() {
  const { data: live } = useLiveStats();
  const { data: featuredRes } = useFeaturedCreator();
  const featured = featuredRes?.featured ?? null;
  const stats = live
    ? [
        { value: compact(live.scripts), label: "Scripts generated" },
        { value: compact(live.projects), label: "Games started" },
        { value: compact(live.users), label: "Builders" },
        { value: compact(live.showcased), label: "In showcase" },
      ]
    : fallbackStats;

  return (
    <div className="min-h-screen flex flex-col overflow-x-hidden">
      <Header />

      <section className="relative overflow-hidden">
        <img
          src={heroBg}
          alt=""
          width={1920}
          height={1280}
          className="hero-bg-img absolute inset-0 h-full w-full object-cover opacity-20 pointer-events-none"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/70 via-background/50 to-background pointer-events-none" />
        <div className="aurora" aria-hidden />

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 pt-12 pb-12 sm:pt-28 sm:pb-28">
          <div className="grid lg:grid-cols-[1.05fr_1fr] gap-8 lg:gap-16 items-center min-w-0">
            <div className="text-left min-w-0">
              <div className="inline-flex items-center gap-2 rounded-full glass-strong pl-1.5 pr-3 py-1 text-[11px] sm:text-xs text-muted-foreground mb-4 sm:mb-6">
                <img src={logo} alt="BloxSmith logo" width={20} height={20} className="h-5 w-5" />
                <span>AI Roblox builder · Studio plugin · Free credits</span>
              </div>
              <h1 className="max-w-5xl text-[2.15rem] sm:text-5xl lg:text-6xl xl:text-7xl font-bold tracking-tight leading-[1.03] break-words">
                Build real Roblox games <span className="gradient-text-premium">with AI.</span>
              </h1>
              <p className="mt-4 sm:mt-6 max-w-xl text-sm sm:text-lg text-muted-foreground leading-relaxed">
                Generate maps, scripts, GUIs, animations, VFX, game systems, and toolbox assets —
                then send everything into Roblox Studio with the BloxSmith plugin.
              </p>
              <div className="mt-6 sm:mt-10 grid grid-cols-1 xs:grid-cols-2 sm:flex sm:flex-wrap gap-3">
                <Link
                  to="/signup"
                  className="btn-shine group inline-flex justify-center items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground glow-ring hover:bg-primary/90 transition"
                >
                  🚀 Start Building Free{" "}
                  <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                </Link>
                <Link
                  to="/plugin"
                  className="inline-flex justify-center items-center gap-2 rounded-xl glass-strong px-5 py-3 text-sm font-semibold hover:bg-surface transition"
                >
                  <Play className="h-4 w-4 text-primary-glow" /> 🎮 Download Plugin
                </Link>
                <a
                  href="#prompt-ideas"
                  className="inline-flex justify-center items-center gap-2 rounded-xl border border-primary/25 bg-primary/10 px-5 py-3 text-sm font-semibold text-primary-glow hover:bg-primary/15 transition"
                >
                  ✨ Try Example Prompts
                </a>
              </div>
              <div className="mt-5 sm:mt-8 grid gap-2 text-xs text-muted-foreground sm:flex sm:flex-wrap sm:items-center sm:gap-x-6">
                <span className="inline-flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-success" /> 150 free starter credits +
                  10 daily
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-success" /> No card required
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-success" /> Pay per use
                </span>
              </div>
              <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 gap-2 max-w-xl">
                {trustBadges.map((badge) => (
                  <div
                    key={badge.label}
                    className="rounded-xl border border-border bg-surface/35 px-3 py-2 text-[11px] font-medium text-muted-foreground inline-flex items-center gap-1.5"
                  >
                    <badge.icon className="h-3.5 w-3.5 text-primary-glow shrink-0" /> {badge.label}
                  </div>
                ))}
              </div>
            </div>

            <div className="relative lg:block">
              <div
                aria-hidden
                className="absolute -inset-8 opacity-60 blur-3xl pointer-events-none"
                style={{
                  background:
                    "linear-gradient(135deg, oklch(0.73 0.17 158 / 0.35), transparent 55%, oklch(0.78 0.16 78 / 0.22))",
                }}
              />
              <div className="relative rounded-2xl glass-strong gradient-border p-2 shadow-[var(--shadow-elegant)] max-sm:scale-[0.96] max-sm:origin-top">
                <div className="rounded-xl overflow-hidden bg-[oklch(0.11_0.04_270)]">
                  <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-[oklch(0.15_0.04_270)]">
                    <div className="flex gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full bg-destructive/70" />
                      <span className="h-2.5 w-2.5 rounded-full bg-[oklch(0.75_0.15_85)]" />
                      <span className="h-2.5 w-2.5 rounded-full bg-success" />
                    </div>
                    <div className="mx-auto text-[10px] sm:text-xs text-muted-foreground inline-flex items-center gap-1.5">
                      <Terminal className="h-3 w-3" /> bloxsmith — Tycoon Starter
                    </div>
                  </div>
                  <div className="text-left">
                    <div className="p-4 sm:p-5 border-b border-border space-y-3">
                      <div className="text-[10px] text-muted-foreground uppercase tracking-[0.18em]">
                        Chat
                      </div>
                      <div className="rounded-lg bg-surface px-3 py-2 text-xs sm:text-sm">
                        Build me a futuristic{" "}
                        <span className="text-primary-glow">space tycoon</span> with pets and a cash
                        shop.
                      </div>
                      <div className="rounded-lg bg-primary/10 border border-primary/20 px-3 py-2 text-xs sm:text-sm">
                        <span className="inline-flex items-center gap-1.5 text-primary-glow font-medium">
                          <Sparkles className="h-3.5 w-3.5" /> BloxSmith
                        </span>
                        <p className="mt-1 text-muted-foreground">
                          Generating scripts, UI, folders, assets, and sync actions…
                        </p>
                      </div>
                    </div>
                    <div className="p-4 sm:p-5 font-mono text-[11px] sm:text-[12px] leading-relaxed overflow-hidden max-sm:max-h-44">
                      <div className="text-[10px] text-muted-foreground uppercase tracking-[0.18em] font-sans mb-2">
                        ServerScriptService / DataService.lua
                      </div>
                      <pre
                        className="text-muted-foreground notranslate whitespace-pre-wrap break-words"
                        translate="no"
                      >
                        <span className="text-primary-glow">local</span> DataService = {"{}"}
                        {"\n"}
                        <span className="text-primary-glow">local</span> Players = game:GetService(
                        <span className="text-success">"Players"</span>){"\n\n"}
                        <span className="text-primary-glow">function</span> DataService.Load(player)
                        {"\n  "}
                        <span className="text-primary-glow">-- synced to Roblox Studio ✓</span>
                        {"\n"}
                        <span className="text-primary-glow">end</span>
                      </pre>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-surface/30 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-5 sm:py-6 grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
          {stats.map((s) => (
            <div key={s.label} className="text-center">
              <div className="text-2xl sm:text-3xl font-bold gradient-text">{s.value}</div>
              <div className="text-[10px] sm:text-xs uppercase tracking-wider text-muted-foreground mt-1">
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 sm:px-6 py-12 sm:py-20">
        <div className="rounded-3xl glass-strong gradient-border p-5 sm:p-8 lg:p-10">
          <SectionTitle
            badge="Live demo"
            icon={Eye}
            title="See how a Roblox idea becomes a Studio build"
            desc="This preview shows the exact BloxSmith flow: prompt, plan, generated files, then plugin sync."
          />
          <div className="mt-8 grid gap-4 lg:grid-cols-4">
            {liveDemoFlow.map((step, i) => (
              <div
                key={step.title}
                className="relative rounded-2xl border border-border bg-background/40 p-5"
              >
                <div className="absolute right-4 top-4 text-4xl font-black text-primary/10">
                  {i + 1}
                </div>
                <step.icon className="h-5 w-5 text-primary-glow" />
                <h3 className="mt-3 font-semibold">{step.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{step.desc}</p>
              </div>
            ))}
          </div>
          <div className="mt-8 flex flex-col sm:flex-row justify-center gap-3">
            <Link
              to="/signup"
              className="inline-flex justify-center items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] hover:bg-primary/90 transition"
            >
              Try the demo prompt <ArrowRight className="h-4 w-4" />
            </Link>
            <a
              href="#prompt-ideas"
              className="inline-flex justify-center items-center gap-2 rounded-xl glass px-5 py-3 text-sm font-semibold hover:bg-surface transition"
            >
              View more prompts
            </a>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 sm:px-6 py-12 sm:py-20">
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] items-stretch">
          <div className="rounded-3xl glass-strong gradient-border p-6 sm:p-8">
            <SectionTitle
              badge="Plugin preview"
              icon={Plug}
              title="What the Roblox Studio plugin does"
              desc="Connect your account once, then let BloxSmith place generated work where it belongs."
            />
            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              {pluginPreview.map((item) => (
                <div
                  key={item}
                  className="rounded-xl border border-border bg-background/40 px-4 py-3 text-sm inline-flex items-center gap-2"
                >
                  <CheckCircle2 className="h-4 w-4 text-success shrink-0" /> {item}
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-3xl glass p-6 sm:p-8">
            <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/15 border border-primary/20 text-primary-glow">
              <Users className="h-5 w-5" />
            </div>
            <h2 className="mt-4 text-2xl font-bold">Beginner friendly</h2>
            <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
              No scripting experience needed. Describe what you want and BloxSmith helps create the
              code, UI, systems, and setup steps for you.
            </p>
            <div className="mt-6 space-y-2">
              {beginnerWins.map((win) => (
                <div
                  key={win}
                  className="text-sm text-muted-foreground inline-flex items-center gap-2"
                >
                  <Sparkles className="h-3.5 w-3.5 text-primary-glow" /> {win}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="py-10 sm:py-14">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="text-center text-xs uppercase tracking-[0.2em] text-muted-foreground mb-6">
            Popular Roblox games you can build
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {gameTypes.map((g) => (
              <div
                key={g}
                className="inline-flex items-center gap-1.5 rounded-full glass px-3 py-1.5 text-xs sm:text-sm"
              >
                <Gamepad2 className="h-3.5 w-3.5 text-primary-glow" /> {g}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 sm:px-6 py-12 sm:py-20">
        <SectionTitle
          badge="What it can make"
          icon={Sparkles}
          title="One AI builder for your whole Roblox game"
          desc="From the first idea to the final polish, BloxSmith helps Roblox users build more than code."
        />
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {canMake.map((item) => (
            <div
              key={item.title}
              className="group glass rounded-2xl p-5 gradient-border hover:bg-surface/60 transition"
            >
              <div className="h-10 w-10 rounded-xl bg-primary/15 grid place-items-center mb-4 group-hover:bg-primary/25 transition">
                <item.icon className="h-5 w-5 text-primary-glow" />
              </div>
              <h3 className="font-semibold">{item.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section
        id="prompt-ideas"
        className="mx-auto max-w-7xl px-4 sm:px-6 py-12 sm:py-20 scroll-mt-24"
      >
        <div className="rounded-3xl glass-strong gradient-border p-5 sm:p-8 lg:p-10">
          <SectionTitle
            badge="Prompt ideas"
            icon={MessageSquare}
            title="Try a prompt and start building fast"
            desc="Use these examples as your first message, then let BloxSmith generate the structure, scripts, and next steps."
          />
          <div className="mt-8 grid gap-3 md:grid-cols-2">
            {promptIdeas.map((prompt) => (
              <Link
                key={prompt}
                to="/signup"
                className="group rounded-2xl border border-border bg-background/40 px-4 py-4 text-sm text-left hover:border-primary/40 hover:bg-primary/10 transition"
              >
                <span className="flex items-start gap-2">
                  <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary-glow" /> “{prompt}”
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 sm:px-6 py-12 sm:py-20">
        <SectionTitle
          badge="AI builder modes"
          icon={Bot}
          title="Choose the mode for the job"
          desc="BloxSmith is made for real Roblox workflows, not just generic chat."
        />
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {builderModes.map((mode) => (
            <div key={mode.title} className="glass rounded-2xl p-6 relative overflow-hidden">
              <mode.icon className="h-5 w-5 text-primary-glow" />
              <h3 className="mt-3 font-semibold">{mode.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{mode.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 sm:px-6 py-12 sm:py-20">
        <SectionTitle
          badge="Why BloxSmith"
          icon={Trophy}
          title="Built different for Roblox creators"
          desc="BloxSmith focuses on Roblox Studio, Luau, plugin sync, and game-building features from day one."
        />
        <div className="mt-10 overflow-x-auto rounded-3xl glass-strong gradient-border">
          <div className="min-w-[680px] grid grid-cols-[1fr_1.15fr_1fr] gap-px bg-border/60 text-xs sm:text-sm">
            <div className="bg-surface-elevated p-3 sm:p-4 font-semibold">Feature</div>
            <div className="bg-primary/10 p-3 sm:p-4 font-semibold text-primary-glow">
              BloxSmith
            </div>
            <div className="bg-surface-elevated p-3 sm:p-4 font-semibold">Generic AI</div>
            {comparison.map(([feature, blox, generic]) => (
              <Fragment key={feature}>
                <div className="bg-background/80 p-3 sm:p-4 font-medium">{feature}</div>
                <div className="bg-background/80 p-3 sm:p-4 text-muted-foreground">{blox}</div>
                <div className="bg-background/80 p-3 sm:p-4 text-muted-foreground">{generic}</div>
              </Fragment>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 sm:px-6 py-12 sm:py-20">
        <div className="rounded-3xl glass-strong p-6 sm:p-10 grid gap-8 lg:grid-cols-[0.9fr_1.1fr] items-center">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full glass px-3 py-1 text-xs text-muted-foreground">
              <Wrench className="h-3 w-3 text-primary-glow" /> Why creators need this
            </div>
            <h2 className="mt-4 text-2xl sm:text-4xl font-bold tracking-tight">
              Build faster without getting stuck for hours
            </h2>
            <p className="mt-3 text-sm sm:text-base text-muted-foreground leading-relaxed">
              BloxSmith helps you go from idea to working Roblox systems without digging through
              endless tutorials, broken free models, or confusing service placement.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {painPoints.map((point) => (
              <div
                key={point}
                className="rounded-2xl border border-border bg-background/40 p-4 text-sm inline-flex items-start gap-2"
              >
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-success shrink-0" /> {point}
              </div>
            ))}
          </div>
        </div>
      </section>

      {featured && (
        <section className="mx-auto max-w-7xl px-4 sm:px-6 py-12 sm:py-16">
          <SectionTitle
            badge="Featured this week"
            icon={Trophy}
            title="Creator spotlight"
            desc="The most-loved community build right now. Tap to play or remix."
          />
          <Link
            to="/showcase/$projectId"
            params={{ projectId: featured.projectId }}
            className="mt-10 group block max-w-5xl mx-auto rounded-3xl glass-strong gradient-border overflow-hidden hover:shadow-[0_30px_80px_-20px_hsl(var(--primary)/0.45)] transition"
          >
            <div className="grid md:grid-cols-2">
              <div className="relative aspect-[4/3] md:min-h-[320px] overflow-hidden bg-surface">
                {featured.thumbnailUrl ? (
                  <img
                    src={featured.thumbnailUrl}
                    alt={featured.title}
                    loading="lazy"
                    className="h-full w-full object-cover transition duration-700 group-hover:scale-105"
                  />
                ) : (
                  <div className="h-full w-full grid place-items-center bg-gradient-to-br from-primary/20 to-primary-glow/10">
                    <Gamepad2 className="h-16 w-16 text-primary-glow/60" />
                  </div>
                )}
              </div>
              <div className="p-6 sm:p-8 flex flex-col justify-center gap-4">
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <Users className="h-4 w-4 text-primary-glow" /> By{" "}
                  <span className="text-foreground font-medium">
                    {featured.creator?.displayName ?? "A BloxSmith creator"}
                  </span>
                </div>
                <h3 className="text-2xl sm:text-3xl font-bold tracking-tight">{featured.title}</h3>
                {featured.description && (
                  <p className="text-sm text-muted-foreground line-clamp-4">
                    {featured.description}
                  </p>
                )}
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Heart className="h-3.5 w-3.5 text-rose-400" /> {featured.likes} likes
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <GitFork className="h-3.5 w-3.5 text-primary-glow" /> Remix
                  </span>
                </div>
              </div>
            </div>
          </Link>
        </section>
      )}

      <section className="mx-auto max-w-7xl px-4 sm:px-6 py-12 sm:py-16">
        <SectionTitle
          badge="Showcase"
          icon={Sparkles}
          title="Real worlds. Real systems. Real fast."
          desc="A glimpse of what creators are shipping with BloxSmith."
        />
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {showcase.map((s) => (
            <div
              key={s.title}
              className="group relative overflow-hidden rounded-2xl glass-strong gradient-border"
            >
              <div className="relative aspect-[4/3] overflow-hidden">
                <img
                  src={s.img}
                  alt={s.title}
                  loading="lazy"
                  width={1280}
                  height={896}
                  className="h-full w-full object-cover transition duration-700 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent pointer-events-none" />
              </div>
              <div className="absolute bottom-0 left-0 right-0 p-5">
                <h3 className="text-lg font-semibold tracking-tight">{s.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section id="features" className="mx-auto max-w-7xl px-4 sm:px-6 py-12 sm:py-20">
        <SectionTitle
          badge="Features"
          icon={Zap}
          title="Everything you need to ship a Roblox game"
          desc="From idea to published place — without leaving your browser."
        />
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div
              key={f.title}
              className="group glass rounded-2xl p-6 gradient-border relative hover:bg-surface/60 transition"
            >
              <div className="h-10 w-10 rounded-xl bg-primary/15 grid place-items-center mb-4 group-hover:bg-primary/25 transition">
                <f.icon className="h-5 w-5 text-primary-glow" />
              </div>
              <h3 className="font-semibold">{f.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 sm:px-6 py-12 sm:py-20">
        <SectionTitle badge="Workflow" icon={Clock} title="From idea to Studio in four steps" />
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s, i) => (
            <div key={s.title} className="glass rounded-2xl p-6 relative overflow-hidden">
              <div className="absolute top-4 right-4 text-5xl font-extrabold text-primary/10 select-none leading-none pointer-events-none">
                {i + 1}
              </div>
              <s.icon className="h-5 w-5 text-primary-glow" />
              <h3 className="mt-3 font-semibold">{s.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 sm:px-6 py-12 sm:py-20">
        <SectionTitle
          badge="Credits"
          icon={CreditCard}
          title="Clear credits, simple pricing"
          desc="Start free, use credits when the AI generates work, and buy more only when you need them."
        />
        <div className="mt-10 grid gap-4 lg:grid-cols-3">
          <div className="glass rounded-2xl p-6">
            <h3 className="font-semibold inline-flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary-glow" /> Free to start
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              New users get starter credits plus daily credits so they can test BloxSmith before
              buying.
            </p>
          </div>
          <div className="glass rounded-2xl p-6">
            <h3 className="font-semibold inline-flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary-glow" /> Credits power generations
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Use credits for AI builds, scripts, fixes, planning, image generation, and plugin
              actions depending on the task size.
            </p>
          </div>
          <div className="glass rounded-2xl p-6">
            <h3 className="font-semibold inline-flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary-glow" /> Pay as you go
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Buy credit packs with PayPal. No monthly pressure — just add credits when you want to
              build more.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 sm:px-6 py-12 sm:py-20">
        <div className="relative overflow-hidden rounded-3xl glass-strong gradient-border p-6 sm:p-10 text-center">
          <div
            aria-hidden
            className="absolute inset-0 opacity-60 pointer-events-none"
            style={{
              background:
                "linear-gradient(135deg, #5865F233, transparent 48%, oklch(0.73 0.17 158 / 0.16))",
            }}
          />
          <div className="relative mx-auto max-w-2xl">
            <Users className="h-8 w-8 mx-auto text-primary-glow" />
            <h2 className="mt-4 text-2xl sm:text-4xl font-bold tracking-tight">
              Join the BloxSmith Discord community
            </h2>
            <p className="mt-3 text-sm sm:text-base text-muted-foreground">
              Get support, updates, free-credit announcements, prompt ideas, plugin help, and a
              place to share your Roblox creations.
            </p>
            <a
              href="https://discord.gg/J9TU7syJCr"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-[#5865F2] px-6 py-3 text-sm font-bold text-white shadow-lg hover:opacity-90 transition"
            >
              Join Discord +5 credits <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 sm:px-6 py-12 sm:py-20">
        <SectionTitle
          badge="Pricing"
          icon={Trophy}
          title="Simple credit packs"
          desc="Pay only for what you generate. Credits never expire."
        />
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {CREDIT_PACKS.map((p) => {
            const popular = "popular" in p && p.popular;
            return (
              <div
                key={p.id}
                className={`relative glass rounded-2xl p-6 flex flex-col ${popular ? "gradient-border ring-1 ring-primary/40" : ""}`}
              >
                {popular && (
                  <div className="absolute -top-3 left-6 rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground shadow-[var(--shadow-glow)]">
                    Most popular
                  </div>
                )}
                <h3 className="font-semibold">{p.name}</h3>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="text-4xl font-bold">${p.price}</span>
                  <span className="text-sm text-muted-foreground">one-time</span>
                </div>
                <div className="text-sm text-muted-foreground mt-1">
                  {p.credits.toLocaleString()} credits
                </div>
                <div className="text-xs text-muted-foreground mt-4 flex-1">Best for: {p.best}</div>
                <Link
                  to="/pricing"
                  className={`mt-6 block text-center rounded-lg px-4 py-2.5 text-sm font-semibold transition ${popular ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-[var(--shadow-glow)]" : "glass-strong hover:bg-surface"}`}
                >
                  Buy with PayPal
                </Link>
              </div>
            );
          })}
        </div>
        <p className="mt-6 text-center text-xs text-muted-foreground inline-flex items-center justify-center gap-1.5 w-full">
          <Shield className="h-3 w-3" /> Manually verified payments. Credits added within minutes.
        </p>
      </section>

      <section className="mx-auto max-w-7xl px-4 sm:px-6 py-12 sm:py-20">
        <SectionTitle
          badge="Coming soon"
          icon={Rocket}
          title="BloxSmith keeps getting smarter"
          desc="Upcoming upgrades planned to make Roblox building even faster and more powerful."
        />
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {comingSoon.map((item) => (
            <div key={item.title} className="glass rounded-2xl p-5">
              <item.icon className="h-5 w-5 text-primary-glow" />
              <h3 className="mt-3 font-semibold text-sm">{item.title}</h3>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 sm:px-6 py-12 sm:py-20">
        <SectionTitle
          badge="Loved by creators"
          icon={Users}
          title="Built by, and for, Roblox devs"
        />
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {testimonials.map((t) => (
            <div key={t.name} className="glass rounded-2xl p-6 flex flex-col">
              <div className="flex gap-0.5 text-primary-glow">
                {Array.from({ length: t.rating }).map((_, i) => (
                  <Star key={i} className="h-4 w-4 fill-current" />
                ))}
              </div>
              <p className="mt-4 text-sm leading-relaxed">“{t.body}”</p>
              <div className="mt-6 pt-4 border-t border-border flex items-center gap-3">
                <div className="h-9 w-9 rounded-full bg-gradient-to-br from-primary to-accent grid place-items-center text-sm font-bold text-primary-foreground">
                  {t.name[0]}
                </div>
                <div>
                  <div className="text-sm font-semibold">{t.name}</div>
                  <div className="text-xs text-muted-foreground">{t.role}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 sm:px-6 py-12 sm:py-20">
        <div className="text-center">
          <h2 className="text-2xl sm:text-4xl font-bold">Questions, answered</h2>
          <p className="text-muted-foreground mt-3">
            Still curious?{" "}
            <Link to="/faq" className="text-primary-glow hover:underline">
              Read the full FAQ →
            </Link>
          </p>
        </div>
        <div className="mt-10 space-y-3">
          {[
            [
              "Does this build full Roblox games?",
              "Yes — BloxSmith generates project structure, server/client scripts, RemoteEvents, modules, UI, assets, and game systems.",
            ],
            [
              "Do I need Roblox Studio?",
              "Yes. BloxSmith creates and edits files; Roblox Studio is where you test and publish your game.",
            ],
            [
              "Does the plugin install scripts?",
              "Yes. Connect the plugin with your token and sync — it places scripts in the right Roblox services automatically.",
            ],
            [
              "Can it fix errors?",
              "Yes. Send Roblox Studio errors back via the plugin and BloxSmith generates a fix you can preview before applying.",
            ],
            [
              "How do credits work?",
              "Free signup includes starter credits. Generations cost credits based on the task, and failed generations are never charged.",
            ],
          ].map(([q, a]) => (
            <details key={q} className="glass rounded-xl p-5 group">
              <summary className="cursor-pointer font-medium flex items-center gap-2 list-none">
                <CheckCircle2 className="h-4 w-4 text-primary-glow shrink-0" />
                <span className="flex-1">{q}</span>
                <span className="text-muted-foreground group-open:rotate-45 transition">+</span>
              </summary>
              <p className="mt-3 text-sm text-muted-foreground pl-6">{a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 sm:px-6 pb-20 sm:pb-24">
        <div className="relative overflow-hidden rounded-3xl glass-strong gradient-border p-8 sm:p-16 text-center">
          <div
            aria-hidden
            className="absolute inset-0 opacity-60 pointer-events-none"
            style={{
              background:
                "linear-gradient(135deg, oklch(0.73 0.17 158 / 0.24), transparent 48%, oklch(0.78 0.16 78 / 0.18))",
            }}
          />
          <div className="relative">
            <Rocket className="h-8 w-8 text-primary-glow mx-auto" />
            <h2 className="mt-4 text-3xl sm:text-5xl font-bold tracking-tight">
              Your next Roblox hit starts now.
            </h2>
            <p className="mt-4 text-muted-foreground max-w-xl mx-auto">
              Join the creators using BloxSmith to prototype, build, and ship faster than ever.
            </p>
            <div className="mt-8 grid grid-cols-1 xs:grid-cols-2 sm:flex sm:justify-center gap-3">
              <Link
                to="/signup"
                className="inline-flex justify-center items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] hover:bg-primary/90 transition"
              >
                Start building free <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/pricing"
                className="inline-flex justify-center items-center gap-2 rounded-xl glass-strong px-6 py-3 text-sm font-semibold hover:bg-surface transition"
              >
                See pricing
              </Link>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
