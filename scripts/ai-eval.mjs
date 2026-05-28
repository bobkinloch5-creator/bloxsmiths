import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const checks = [
  {
    name: "Roblox docs search tool is available to models",
    file: "src/lib/ai-tools.server.ts",
    must: [/roblox_docs_search/, /searchRobloxDocs/, /strict:\s*true/],
  },
  {
    name: "Chat can use docs, web, and Roblox asset tools",
    file: "src/lib/ai.functions.ts",
    must: [
      /roblox_docs_search/,
      /roblox_asset_search/,
      /recordProviderHealth/,
      /compactChatHistory/,
      /pickChatTools/,
      /maxRetries:\s*0/,
    ],
  },
  {
    name: "Build path records provider health and uses model profiles",
    file: "src/routes/api/assistant/execute.ts",
    must: [
      /recordProviderHealth/,
      /getModelProfile/,
      /classifyProviderError/,
      /roblox_docs_search/,
      /Promise\.all/,
      /maxRetries:\s*0/,
    ],
  },
  {
    name: "Generate path keeps tools and retries fast",
    file: "src/lib/ai.functions.ts",
    must: [
      /pickGenerationTools/,
      /shouldLoadUserMcpTools/,
      /maxRetries:\s*0/,
      /Promise\.all/,
      /timeout:\s*\{/,
    ],
  },
  {
    name: "Project memory is persisted and injected into AI prompts",
    file: "src/lib/ai-memory.server.ts",
    must: [
      /project_ai_memories/,
      /rememberProjectInteraction/,
      /buildProjectMemoryBlock/,
      /extractProjectMemories/,
    ],
  },
  {
    name: "Build API uses persistent project memory",
    file: "src/routes/api/assistant/execute.ts",
    must: [
      /buildProjectMemoryBlock/,
      /rememberProjectInteraction/,
      /memoryBlock/,
      /PROJECT MEMORY/,
    ],
  },
  {
    name: "Roblox safety validation blocks common backdoors",
    file: "src/lib/sync-validation.ts",
    must: [/BACKDOOR_PATTERNS/, /require\s*\(/, /loadstring/, /InsertService/],
  },
  {
    name: "Knowledge core tells models when to check official docs",
    file: "src/lib/roblox-knowledge.ts",
    must: [/roblox_docs_search/, /DataStores/, /Remote/, /MarketplaceService/],
  },
  {
    name: "Smartest builder core exists with strict Roblox placement rules",
    file: "src/lib/ai-smartest-builder-core.ts",
    must: [
      /SMART_BUILDER_SYSTEM_UPGRADE/,
      /ServerScriptService\/<FeatureName>/,
      /ReplicatedStorage\/Remotes\/<FeatureName>/,
      /StarterGui\/<GuiName>/,
      /Workspace\/<FeatureName>/,
    ],
  },
  {
    name: "Smartest builder core enforces safety and server authority",
    file: "src/lib/ai-smartest-builder-core.ts",
    must: [
      /Safe server authority/,
      /RemoteEvent validation/,
      /pcall and UpdateAsync/,
      /loadstring/,
      /require\(assetId\)/,
    ],
  },
  {
    name: "Smartest builder core supports mobile-first builder UI",
    file: "src/lib/ai-smartest-builder-core.ts",
    must: [
      /Mobile-first website and chat rule/,
      /360px/,
      /safe-area-inset-bottom/,
      /44px tap targets/,
      /Dedicated Generate Image button/,
    ],
  },
  {
    name: "Smartest builder core supports Roblox image generation",
    file: "src/lib/ai-smartest-builder-core.ts",
    must: [
      /Image generation rule for Roblox thumbnails\/icons\/decals/,
      /ROBLOX_IMAGE_PRESETS/,
      /thumbnail/,
      /icon/,
      /decal/,
      /verticalPromo/,
    ],
  },
  {
    name: "Smartest builder docs explain workflow and product standard",
    file: "docs/SMART_AI_BUILDER_UPGRADE.md",
    must: [/Understand/, /Scan/, /Classify/, /Generate/, /Validate/, /Queue/, /Remember/],
  },
  {
    name: "Smartest builder docs include mobile and image requirements",
    file: "docs/SMART_AI_BUILDER_UPGRADE.md",
    must: [
      /Mobile-first builder requirements/,
      /Image generation button requirement/,
      /Game Thumbnail/,
      /Game Icon/,
      /Decal \/ Badge \/ Gamepass/,
      /Mobile Promo/,
    ],
  },
];

let failed = 0;

for (const check of checks) {
  const text = read(check.file);
  const missing = check.must.filter((pattern) => !pattern.test(text));
  if (missing.length) {
    failed += 1;
    console.error(`FAIL ${check.name}`);
    console.error(`  ${check.file}`);
    console.error(`  Missing: ${missing.map(String).join(", ")}`);
  } else {
    console.log(`PASS ${check.name}`);
  }
}

const evalCases = [
  {
    prompt: "Fix my DataStore save script",
    expected: ["pcall", "UpdateAsync", "server"],
  },
  {
    prompt: "Make a sword combat system with RemoteEvents",
    expected: ["RemoteEvent", "server validation", "cooldown"],
  },
  {
    prompt: "Add a shop GUI for mobile",
    expected: ["StarterGui", "LocalScript", "mobile"],
  },
  {
    prompt: "Use a free Roblox model for a lobby map",
    expected: ["assetId", "scan", "unsafe scripts"],
  },
  {
    prompt: "Make me a mining simulator with pets, backpacks, ores, rebirths and a shop",
    expected: ["Workspace", "ServerScriptService", "StarterGui", "ReplicatedStorage", "DataStore"],
  },
  {
    prompt: "My RemoteEvent gives coins but exploiters can spam it fix it",
    expected: ["server authority", "cooldown", "type check", "rate limit"],
  },
  {
    prompt: "Make the UI premium and animated for mobile",
    expected: ["TweenService", "UIScale", "StarterGui", "mobile"],
  },
  {
    prompt: "Make a horror game flashlight, chase NPC, scary lighting and doors",
    expected: ["Lighting", "PathfindingService", "StarterPlayerScripts", "Workspace"],
  },
  {
    prompt: "Generate a Roblox thumbnail for my obby game",
    expected: ["generate_image", "16:9", "thumbnail"],
  },
  {
    prompt: "Make me a 1:1 Roblox game icon with a cute dog",
    expected: ["generate_image", "1:1", "icon"],
  },
  {
    prompt: "Create a decal image for a pet simulator egg",
    expected: ["generate_image", "1:1", "decal"],
  },
  {
    prompt: "Fix the mobile chat because the message box is too wide on iPhone",
    expected: ["360px", "safe-area", "no horizontal overflow", "44px"],
  },
];

console.log(`\nAI eval prompt set: ${evalCases.length} Roblox reliability cases`);
for (const item of evalCases) {
  console.log(`- ${item.prompt} -> ${item.expected.join(", ")}`);
}

if (failed) {
  process.exitCode = 1;
}
