type RobloxDocResult = {
  title: string;
  url: string;
  summary: string;
  source: "direct" | "search" | "curated";
};

const DOC_BASE = "https://create.roblox.com/docs";

const CURATED_DOCS: Array<{ keys: RegExp; title: string; url: string; summary: string }> = [
  {
    keys: /\b(datastore|data store|save|saving|profile)\b/i,
    title: "Data Stores",
    url: `${DOC_BASE}/cloud-services/data-stores`,
    summary:
      "Use DataStoreService from the server, wrap calls in pcall, prefer UpdateAsync for merges, and avoid high-frequency writes.",
  },
  {
    keys: /\b(remoteevent|remote event|remotefunction|remote function|client server|server validation)\b/i,
    title: "Remote Events and Callbacks",
    url: `${DOC_BASE}/scripting/events/remote`,
    summary:
      "Use ReplicatedStorage remotes for client/server messages. Treat every client payload as untrusted and validate on the server.",
  },
  {
    keys: /\b(animation|animator|loadanimation|humanoid)\b/i,
    title: "Character Animation",
    url: `${DOC_BASE}/animation`,
    summary:
      "Load animations through Animator objects on Humanoids or AnimationControllers; avoid deprecated Humanoid:LoadAnimation patterns.",
  },
  {
    keys: /\b(pathfinding|npc|enemy ai|waypoint)\b/i,
    title: "Pathfinding",
    url: `${DOC_BASE}/characters/pathfinding`,
    summary:
      "Use PathfindingService to compute paths, handle blocked paths, and move NPCs by waypoint with server-owned logic.",
  },
  {
    keys: /\b(ui|gui|screengui|button|mobile|hud|menu)\b/i,
    title: "UI",
    url: `${DOC_BASE}/ui`,
    summary:
      "Place ScreenGui under StarterGui, run UI logic in LocalScripts, and design with scale constraints for mobile screens.",
  },
  {
    keys: /\b(monetization|gamepass|game pass|developer product|dev product|purchase)\b/i,
    title: "Monetization",
    url: `${DOC_BASE}/production/monetization`,
    summary:
      "Use MarketplaceService. Award purchases from server callbacks and verify ownership/receipts server-side.",
  },
  {
    keys: /\b(memory store|memorystore|queue|sorted map|matchmaking)\b/i,
    title: "Memory Stores",
    url: `${DOC_BASE}/cloud-services/memory-stores`,
    summary:
      "Use MemoryStoreService for short-lived cross-server state such as queues, matchmaking, and cooldown coordination.",
  },
  {
    keys: /\b(terrain|biome|map|world|environment)\b/i,
    title: "Terrain",
    url: `${DOC_BASE}/parts/terrain`,
    summary:
      "Use Studio/plugin edit-mode terrain actions for persistent terrain. Runtime FillBlock scripts only affect play sessions.",
  },
  {
    keys: /\b(luau|lua|types|strict|module)\b/i,
    title: "Luau",
    url: "https://luau.org",
    summary:
      "Luau is Roblox's scripting language. Prefer typed modules, clear services, and explicit server/client boundaries.",
  },
];

const ENGINE_CLASS_RE =
  /\b(Players|ReplicatedStorage|ServerScriptService|ServerStorage|StarterGui|StarterPlayer|DataStoreService|MarketplaceService|RunService|TweenService|SoundService|Lighting|Teams|CollectionService|PhysicsService|PathfindingService|TeleportService|MessagingService|MemoryStoreService|RemoteEvent|RemoteFunction|ScreenGui|TextButton|Frame|Humanoid|Animator|AnimationController|Part|Model|Folder|Tool|ProximityPrompt|ClickDetector|TextChatService)\b/g;

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function cleanText(text: string, maxChars: number): string {
  return text
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxChars);
}

async function fetchDocSummary(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "BloxSmith/1.0", Accept: "text/html,*/*" },
    });
    if (!res.ok) return null;
    return cleanText(await res.text(), 1200);
  } catch {
    return null;
  }
}

async function searchOfficialDocs(query: string, limit: number): Promise<RobloxDocResult[]> {
  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(
      `site:create.roblox.com/docs ${query}`,
    )}&format=json&no_html=1&no_redirect=1&t=bloxsmith`;
    const res = await fetch(url, { headers: { "User-Agent": "BloxSmith/1.0" } });
    if (!res.ok) return [];
    const json: any = await res.json();
    const topics = (json.RelatedTopics ?? [])
      .flatMap((topic: any) => (topic.Topics ? topic.Topics : [topic]))
      .filter(
        (topic: any) =>
          typeof topic?.FirstURL === "string" && topic.FirstURL.includes("create.roblox.com/docs"),
      )
      .slice(0, limit);
    return topics.map((topic: any) => ({
      title: String(topic.Text ?? "Roblox Creator Hub")
        .split(" - ")[0]
        .slice(0, 100),
      url: topic.FirstURL,
      summary: String(topic.Text ?? "").slice(0, 500),
      source: "search" as const,
    }));
  } catch {
    return [];
  }
}

export async function searchRobloxDocs(query: string, limit = 5): Promise<RobloxDocResult[]> {
  const out: RobloxDocResult[] = [];

  for (const doc of CURATED_DOCS) {
    if (doc.keys.test(query)) {
      out.push({ title: doc.title, url: doc.url, summary: doc.summary, source: "curated" });
    }
  }

  const classes = unique(Array.from(query.matchAll(ENGINE_CLASS_RE)).map((match) => match[1]));
  for (const className of classes.slice(0, 4)) {
    const url = `${DOC_BASE}/reference/engine/classes/${encodeURIComponent(className)}`;
    const summary = await fetchDocSummary(url);
    out.push({
      title: `${className} API Reference`,
      url,
      summary: summary || `Official Roblox Engine API page for ${className}.`,
      source: "direct",
    });
  }

  if (out.length < limit) {
    out.push(...(await searchOfficialDocs(query, limit - out.length)));
  }

  const seen = new Set<string>();
  return out
    .filter((item) => {
      if (seen.has(item.url)) return false;
      seen.add(item.url);
      return true;
    })
    .slice(0, limit);
}
