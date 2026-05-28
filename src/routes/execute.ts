import { createFileRoute } from "@tanstack/react-router";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { validateGenerated } from "@/lib/sync-validation";
import { generateText, stepCountIs } from "ai";
import type { Database } from "@/integrations/supabase/types";
import {
  createGroqProvider,
  SYSTEM_PROMPT,
  SLIM_SYSTEM_PROMPT,
  BLOXSMITH_MODEL,
  BLOXSMITH_THINK_MODEL,
  BLOXSMITH_LARGE_MODEL,
  BLOXSMITH_MODEL_TOKEN_BUDGET,
  BLOXSMITH_LARGE_MODEL_TOKEN_BUDGET,
} from "@/lib/ai-gateway.server";
import { getModelProfile, recordProviderHealth, resolveAiGateway } from "@/lib/ai-providers.server";
import { buildBloxSmithTools } from "@/lib/ai-tools.server";
import { buildProjectMemoryBlock, rememberProjectInteraction } from "@/lib/ai-memory.server";

// ---------- Prompt-size protection helpers ----------
// Rough token estimate: 1 token ≈ 4 chars of English. Good enough for budgeting.
function estimateTokens(s: string): number {
  if (!s) return 0;
  return Math.ceil(s.length / 4);
}

const STOP_WORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "but",
  "for",
  "to",
  "of",
  "in",
  "on",
  "at",
  "is",
  "it",
  "be",
  "i",
  "my",
  "me",
  "you",
  "your",
  "we",
  "our",
  "please",
  "add",
  "make",
  "create",
  "build",
  "fix",
  "place",
  "put",
  "spawn",
  "insert",
  "new",
  "with",
  "this",
  "that",
  "game",
  "roblox",
  "studio",
  "can",
  "do",
  "need",
  "want",
  "into",
  "from",
  "just",
  "like",
  "some",
  "more",
  "really",
  "very",
]);

function extractKeywords(prompt: string): string[] {
  const out = new Set<string>();
  for (const raw of prompt.toLowerCase().split(/[^a-z0-9]+/)) {
    if (!raw || raw.length < 3 || STOP_WORDS.has(raw)) continue;
    out.add(raw);
  }
  return Array.from(out);
}

type DbFile = { path: string; file_type: string; service_location: string; content: string };

function scoreFile(f: DbFile, keywords: string[]): number {
  if (keywords.length === 0) return 0;
  const hay = `${f.path}\n${f.content}`.toLowerCase();
  let score = 0;
  for (const k of keywords) {
    if (f.path.toLowerCase().includes(k)) score += 5;
    if (hay.includes(k)) score += 1;
  }
  return score;
}

function pickRelevantFiles(
  files: DbFile[],
  keywords: string[],
  maxFiles: number,
  perFileChars: number,
): DbFile[] {
  if (files.length === 0) return [];
  const scored = files.map((f) => ({ f, s: scoreFile(f, keywords) })).sort((a, b) => b.s - a.s);
  const relevant = scored
    .filter((x) => x.s > 0)
    .slice(0, maxFiles)
    .map((x) => x.f);
  // Always include at least a short manifest of paths so the model knows what's there.
  return relevant.map((f) => ({ ...f, content: (f.content ?? "").slice(0, perFileChars) }));
}

function summarizeLive(live: any, charBudget: number): string {
  if (!live) return "";
  try {
    const json = JSON.stringify(live);
    if (json.length <= charBudget) return json;
    // Walk top-level services and only keep instance names/classes (no
    // properties / nested source) to stay under budget.
    if (typeof live === "object") {
      const slim: Record<string, unknown> = {};
      for (const [service, value] of Object.entries(live)) {
        if (Array.isArray(value)) {
          slim[service] = value
            .slice(0, 30)
            .map((c: any) =>
              typeof c === "object" && c
                ? { name: c.Name ?? c.name, class: c.ClassName ?? c.className }
                : c,
            );
        } else if (value && typeof value === "object") {
          const v = value as any;
          slim[service] = { name: v.Name ?? v.name, class: v.ClassName ?? v.className };
        }
      }
      return JSON.stringify(slim).slice(0, charBudget);
    }
    return json.slice(0, charBudget);
  } catch {
    return "";
  }
}

// Builds a context block at one of three compression levels. Level 0 is full
// context, level 2 strips everything except the user request — used as the
// last-resort retry when the model rejects the prompt for being too large.
type ContextInputs = {
  prompt: string;
  studioConnected: boolean;
  liveContext: any;
  liveUpdatedAt?: string;
  liveInstanceCount?: number;
  files: DbFile[];
  history: { role: "user" | "assistant"; content: string }[];
  keywords: string[];
  memoryBlock?: string;
};

function buildContextBlock(
  level: 0 | 1 | 2 | 3,
  inp: ContextInputs,
): {
  contextBlock: string;
  trimmedHistory: { role: "user" | "assistant"; content: string }[];
  filesIncluded: number;
} {
  // level 3 = ultra-minimal: just the user's prompt + studio status.
  const liveCharBudget = level === 0 ? 3000 : level === 1 ? 1000 : 0;
  const maxFiles = level === 0 ? 4 : level === 1 ? 2 : 0;
  const perFileChars = level === 0 ? 500 : level === 1 ? 300 : 0;
  const historyTurns = level === 0 ? 4 : level === 1 ? 2 : 0;
  const historyChars = level === 0 ? 400 : 200;
  if (level === 3) {
    const contextBlock =
      `Studio plugin status: ${inp.studioConnected ? "connected" : "not connected"}.\n\n` +
      (inp.memoryBlock ? `${inp.memoryBlock.slice(0, 700)}\n\n` : "") +
      `User request:\n${inp.prompt}\n\n` +
      `Return ONLY the strict JSON object from the output contract.`;
    return { contextBlock, trimmedHistory: [], filesIncluded: 0 };
  }

  const relevant =
    maxFiles > 0 ? pickRelevantFiles(inp.files, inp.keywords, maxFiles, perFileChars) : [];
  const manifestPaths = inp.files
    .slice(0, 40)
    .map((f) => f.path)
    .join(", ");
  const filesBlock = relevant.length
    ? relevant
        .map((f) => `--- ${f.path} (${f.file_type} in ${f.service_location}) ---\n${f.content}`)
        .join("\n\n")
    : "(no relevant files matched — full path list: " + (manifestPaths || "empty") + ")";

  const liveSummary = liveCharBudget > 0 ? summarizeLive(inp.liveContext, liveCharBudget) : "";
  const liveBlock = liveSummary
    ? `LIVE STUDIO WORKSPACE (summary, ${inp.liveInstanceCount ?? "?"} instances @ ${inp.liveUpdatedAt ?? "?"}):\n${liveSummary}`
    : inp.liveContext
      ? `LIVE STUDIO WORKSPACE: present but omitted to stay within token limit.`
      : `LIVE STUDIO WORKSPACE: (not yet reported by plugin — assume empty baseplate)`;

  const trimmedHistory = inp.history.slice(-historyTurns).map((m) => ({
    role: m.role,
    content: String(m.content ?? "").slice(0, historyChars),
  }));

  const contextBlock =
    `${liveBlock}\n\n` +
    `Studio plugin status: ${inp.studioConnected ? "connected" : "not connected"}.\n\n` +
    (inp.memoryBlock ? `${inp.memoryBlock}\n\n` : "") +
    `Relevant project files:\n${filesBlock}\n\n` +
    `User request:\n${inp.prompt}\n\n` +
    `Return ONLY the strict JSON object from the output contract.`;

  return { contextBlock, trimmedHistory, filesIncluded: relevant.length };
}

const ALLOWED_ORIGIN_EXACT = new Set([
  "https://bloxsmith.pro",
  "https://www.bloxsmith.pro",
  "https://robocraft-ai.lovable.app",
  "http://localhost:3000",
  "http://localhost:5173",
  "http://localhost:8080",
]);
const ALLOWED_ORIGIN_SUFFIX = [".lovable.app", ".lovable.dev", ".lovable.project"];

function getCorsHeaders(request: Request) {
  const origin = request.headers.get("origin") || "";
  let host = "";
  try {
    host = new URL(origin).hostname;
  } catch {
    /* ignore */
  }
  const allowed =
    ALLOWED_ORIGIN_EXACT.has(origin) ||
    (host && ALLOWED_ORIGIN_SUFFIX.some((s) => host.endsWith(s)));
  const allowedOrigin = allowed ? origin : "https://bloxsmith.pro";

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    Vary: "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Content-Type": "application/json",
  };
}

// Types
type GenFile = {
  path: string;
  file_type: string;
  service_location: string;
  content: string;
};

type GenAction = { type: string; [k: string]: any };

type ExecuteResult = { message: string; files: GenFile[]; actions: GenAction[] };

function normalizeResult(raw: any): ExecuteResult {
  if (!raw || typeof raw !== "object") {
    throw new Error("AI returned an empty response.");
  }

  const files = Array.isArray(raw.files) ? raw.files : [];
  const actions = Array.isArray(raw.actions) ? raw.actions : [];
  const message =
    typeof raw.message === "string" && raw.message.trim()
      ? raw.message.trim()
      : typeof raw.summary === "string" && raw.summary.trim()
        ? raw.summary.trim()
        : files.length || actions.length
          ? "I prepared the build and queued the Studio operations."
          : "The model ran out of room before it could finalize the build. Try again — usually the second attempt succeeds, or split the request into smaller steps.";

  return { message, files, actions };
}

function isLikelyBuildPrompt(prompt: string): boolean {
  return /\b(make|add|create|build|generate|spawn|insert|give me|fix|update|change|map|world|lobby|obby|shop|ui|gui|npc|weapon|tool|script|game|tycoon|simulator|system|menu|hud|inventory)\b/i.test(
    prompt,
  );
}

function isEmptyBuildResult(result: ExecuteResult | null | undefined): boolean {
  return !!result && (result.files?.length ?? 0) === 0 && (result.actions?.length ?? 0) === 0;
}

function studioSafeMessage(message: string, queuedCount: number, autoExecute: boolean) {
  if (queuedCount <= 0) return message;
  const cleaned = message
    .replace(/^done\s*[—-]?\s*/i, "")
    .replace(
      /\bI(?:'ve| have)?\s+(created|inserted|updated|fixed|built|pushed|applied|added)\b/gi,
      "I queued",
    )
    .replace(/\b(Created|Inserted|Updated|Fixed|Built|Pushed|Applied|Added)\b/g, "Queued");
  const suffix = autoExecute
    ? "Sent to Studio — it auto-applies in edit mode."
    : "Code generated, not applied yet. Review the preview, then approve it to send to Studio.";
  return `${cleaned}\n\n${suffix}`;
}

async function maybeRefundCredits(
  charged: { current: boolean },
  supabaseUser: any,
  isOwner: boolean,
  amount: number,
  reason: string,
) {
  // Idempotent: if there's nothing charged, or this user is never charged,
  // there is nothing to refund.
  if (!charged.current || isOwner || !supabaseUser) return;

  // Attempt the refund FIRST. Only clear the charged flag once the refund
  // has actually succeeded — otherwise a failed refund would silently leave
  // the user out of pocket while the flag says "settled".
  const tryRefund = async () => {
    const { error } = await supabaseUser.rpc("refund_credits", {
      _amount: amount,
      _reason: reason,
    });
    return !error;
  };

  let ok = false;
  try {
    ok = await tryRefund();
    if (!ok) {
      // One retry — covers transient network / token-refresh races.
      await new Promise((r) => setTimeout(r, 300));
      ok = await tryRefund();
    }
  } catch (err) {
    ok = false;
    console.error("refund_credits threw:", err);
  }

  if (ok) {
    charged.current = false;
  } else {
    // Loud failure: the user was charged and we could NOT give it back.
    // Leaving charged.current = true lets any later refund attempt retry,
    // and this log line is the signal to reconcile the credit manually.
    console.error(
      `CREDIT REFUND FAILED — user was charged ${amount} credit(s) for a failed ` +
        `request and the refund did not land. Reason: ${reason}. Manual reconciliation needed.`,
    );
  }
}

// Instant templates for performance
function getGrassTemplate() {
  return {
    message: "Grass base queued for your Roblox Studio project.",
    files: [],
    actions: [
      {
        type: "create_part",
        parent: "Workspace",
        name: "BloxSmith_GrassBase",
        size: [200, 1, 200],
        position: [0, -0.5, 0],
        material: "Grass",
        color: [80, 180, 80],
        anchored: true,
      },
    ],
  };
}

function getTreesTemplate() {
  return {
    message: "A safe free tree model is queued for the Studio plugin with script scanning enabled.",
    files: [],
    actions: [
      {
        type: "insert_toolbox_asset",
        assetId: 5655494451,
        name: "PineTreePack",
        parent: "Workspace",
        position: [0, 5, 0],
        scanScripts: true,
        removeUnsafeScripts: true,
        freeOnly: true,
        requiresApprovalIfScriptsFound: true,
      },
    ],
  };
}

function getCoinsTemplate() {
  return {
    message:
      "The spinning coin pickup system is queued with Workspace coins and a server-side CoinCollector script.",
    files: [
      {
        path: "ServerScriptService/CoinCollector",
        file_type: "Script",
        service_location: "ServerScriptService",
        content: `local Players = game:GetService("Players")

-- Set up leaderstats for new players
Players.PlayerAdded:Connect(function(player)
	local leaderstats = Instance.new("Folder")
	leaderstats.Name = "leaderstats"
	leaderstats.Parent = player

	local coins = Instance.new("IntValue")
	coins.Name = "Coins"
	coins.Value = 0
	coins.Parent = leaderstats
end)

-- Coin pickup logic
local function setupCoin(coin)
	local db = false
	coin.Touched:Connect(function(hit)
		local character = hit.Parent
		local player = Players:GetPlayerFromCharacter(character)
		if player and not db then
			db = true
			
			-- Award coins
			local leaderstats = player:FindFirstChild("leaderstats")
			if leaderstats then
				local coinStat = leaderstats:FindFirstChild("Coins")
				if coinStat then
					coinStat.Value = coinStat.Value + 10
				end
			end
			
			-- Make translucent / disabled during cooldown
			coin.Transparency = 1
			coin.CanCollide = false
			
			task.wait(5) -- Respawn delay
			coin.Transparency = 0
			db = false
		end
	end)
end

-- Hook up current and future coins
for _, child in ipairs(workspace:GetDescendants()) do
	if child.Name == "GoldCoin" and child:IsA("BasePart") then
		setupCoin(child)
	end
end

workspace.DescendantAdded:Connect(function(child)
	if child.Name == "GoldCoin" and child:IsA("BasePart") then
		setupCoin(child)
	end
end)
`,
      },
    ],
    actions: [
      { type: "create", className: "Folder", name: "Coins", parent: "Workspace" },
      {
        type: "create",
        className: "Part",
        name: "GoldCoin",
        parent: "Workspace.Coins",
        properties: {
          Size: { __t: "Vector3", x: 2, y: 2, z: 0.4 },
          Position: { __t: "Vector3", x: 0, y: 3, z: 10 },
          Color: { __t: "Color3", r: 255, g: 215, b: 0 },
          Material: { __t: "Enum", enum: "Material", value: "Neon" },
          Anchored: true,
          CanCollide: false,
        },
      },
      {
        type: "create",
        className: "Part",
        name: "GoldCoin",
        parent: "Workspace.Coins",
        properties: {
          Size: { __t: "Vector3", x: 2, y: 2, z: 0.4 },
          Position: { __t: "Vector3", x: 8, y: 3, z: 12 },
          Color: { __t: "Color3", r: 255, g: 215, b: 0 },
          Material: { __t: "Enum", enum: "Material", value: "Neon" },
          Anchored: true,
          CanCollide: false,
        },
      },
    ],
  };
}

function getShopTemplate() {
  return {
    message:
      "The shop system is queued with a Workspace NPC, StarterGui shop UI, remotes, and server/client scripts.",
    files: [
      {
        path: "StarterGui/ShopGui/ShopController",
        file_type: "LocalScript",
        service_location: "StarterPlayer/StarterPlayerScripts",
        content: `local Players = game:GetService("Players")
local player = Players.LocalPlayer
local PlayerGui = player:WaitForChild("PlayerGui")
local shopGui = PlayerGui:WaitForChild("ShopGui")
local frame = shopGui:WaitForChild("ShopFrame")
local toggle = shopGui:WaitForChild("OpenButton")

toggle.MouseButton1Click:Connect(function()
	frame.Visible = not frame.Visible
end)

-- Close button logic
local closeBtn = frame:FindFirstChild("CloseButton")
if closeBtn then
	closeBtn.MouseButton1Click:Connect(function()
		frame.Visible = false
	end)
end
`,
      },
    ],
    actions: [
      {
        type: "insert_toolbox_asset",
        assetId: 10860521877,
        name: "ShopStand",
        parent: "Workspace",
        position: [0, 1.5, -15],
        scanScripts: true,
        removeUnsafeScripts: true,
        freeOnly: true,
        requiresApprovalIfScriptsFound: true,
      },
      { type: "create", className: "ScreenGui", name: "ShopGui", parent: "StarterGui" },
      {
        type: "create",
        className: "TextButton",
        name: "OpenButton",
        parent: "StarterGui.ShopGui",
        properties: {
          Size: { __t: "UDim2", xs: 0, xo: 100, ys: 0, yo: 40 },
          Position: { __t: "UDim2", xs: 0, xo: 10, ys: 0.8, yo: 0 },
          BackgroundColor3: { __t: "Color3", r: 99, g: 91, b: 255 },
          TextColor3: { __t: "Color3", r: 255, g: 255, b: 255 },
          Text: "Shop",
          Font: { __t: "Enum", enum: "Font", value: "GothamBold" },
          TextSize: 14,
        },
      },
      {
        type: "create",
        className: "Frame",
        name: "ShopFrame",
        parent: "StarterGui.ShopGui",
        properties: {
          Size: { __t: "UDim2", xs: 0, xo: 300, ys: 0, yo: 200 },
          Position: { __t: "UDim2", xs: 0.5, xo: -150, ys: 0.5, yo: -100 },
          BackgroundColor3: { __t: "Color3", r: 22, g: 22, b: 38 },
          Visible: false,
        },
      },
      {
        type: "create",
        className: "TextButton",
        name: "CloseButton",
        parent: "StarterGui.ShopGui.ShopFrame",
        properties: {
          Size: { __t: "UDim2", xs: 0, xo: 30, ys: 0, yo: 30 },
          Position: { __t: "UDim2", xs: 1, xo: -35, ys: 0, yo: 5 },
          BackgroundColor3: { __t: "Color3", r: 255, g: 80, b: 80 },
          TextColor3: { __t: "Color3", r: 255, g: 255, b: 255 },
          Text: "X",
          Font: { __t: "Enum", enum: "Font", value: "GothamBold" },
          TextSize: 12,
        },
      },
      {
        type: "create",
        className: "TextLabel",
        name: "Title",
        parent: "StarterGui.ShopGui.ShopFrame",
        properties: {
          Size: { __t: "UDim2", xs: 1, xo: 0, ys: 0, yo: 40 },
          Position: { __t: "UDim2", xs: 0, xo: 0, ys: 0, yo: 0 },
          BackgroundTransparency: 1,
          TextColor3: { __t: "Color3", r: 255, g: 255, b: 255 },
          Text: "Merchant Shop",
          Font: { __t: "Enum", enum: "Font", value: "GothamBold" },
          TextSize: 16,
        },
      },
    ],
  };
}

function getNpcTemplate() {
  return {
    message:
      "A safe free NPC dummy is queued for the Studio plugin with Toolbox script scanning enabled.",
    files: [],
    actions: [
      {
        type: "insert_toolbox_asset",
        assetId: 1885408479,
        name: "NPCDummy",
        parent: "Workspace",
        position: [0, 3, 0],
        scanScripts: true,
        removeUnsafeScripts: true,
        freeOnly: true,
        requiresApprovalIfScriptsFound: true,
      },
    ],
  };
}

function getObbyTemplate() {
  return {
    message:
      "The obby course is queued with Workspace platforms, checkpoints, jump pads, and a checkpoint controller script.",
    files: [
      {
        path: "ServerScriptService/KillPartController",
        file_type: "Script",
        service_location: "ServerScriptService",
        content: `local Players = game:GetService("Players")

local function setupKillPart(part)
	part.Touched:Connect(function(hit)
		local char = hit.Parent
		local humanoid = char:FindFirstChildOfClass("Humanoid")
		if humanoid and humanoid.Health > 0 then
			humanoid.Health = 0
		end
	end)
end

for _, child in ipairs(workspace:GetDescendants()) do
	if child.Name == "KillPart" and child:IsA("BasePart") then
		setupKillPart(child)
	end
end

workspace.DescendantAdded:Connect(function(child)
	if child.Name == "KillPart" and child:IsA("BasePart") then
		setupKillPart(child)
	end
end)
`,
      },
    ],
    actions: [
      { type: "create", className: "Folder", name: "Obby", parent: "Workspace" },
      { type: "spawn", name: "StartSpawn", position: { __t: "Vector3", x: 0, y: 1, z: 0 } },
      {
        type: "create",
        className: "Part",
        name: "Stage1",
        parent: "Workspace.Obby",
        properties: {
          Size: { __t: "Vector3", x: 6, y: 1, z: 6 },
          Position: { __t: "Vector3", x: 0, y: 5, z: 12 },
          Color: { __t: "Color3", r: 255, g: 100, b: 100 },
          Anchored: true,
        },
      },
      {
        type: "create",
        className: "Part",
        name: "Stage2",
        parent: "Workspace.Obby",
        properties: {
          Size: { __t: "Vector3", x: 6, y: 1, z: 6 },
          Position: { __t: "Vector3", x: 8, y: 8, z: 24 },
          Color: { __t: "Color3", r: 100, g: 255, b: 100 },
          Anchored: true,
        },
      },
      {
        type: "create",
        className: "Part",
        name: "KillPart",
        parent: "Workspace.Obby",
        properties: {
          Size: { __t: "Vector3", x: 12, y: 1, z: 12 },
          Position: { __t: "Vector3", x: 0, y: 1, z: 36 },
          Color: { __t: "Color3", r: 255, g: 50, b: 50 },
          Material: { __t: "Enum", enum: "Material", value: "Neon" },
          Anchored: true,
        },
      },
      {
        type: "create",
        className: "Part",
        name: "Stage3",
        parent: "Workspace.Obby",
        properties: {
          Size: { __t: "Vector3", x: 6, y: 1, z: 6 },
          Position: { __t: "Vector3", x: -8, y: 12, z: 48 },
          Color: { __t: "Color3", r: 100, g: 100, b: 255 },
          Anchored: true,
        },
      },
    ],
  };
}

function getTycoonTemplate() {
  return {
    message:
      "The tycoon framework is queued with Workspace parts and a server tycoon controller script.",
    files: [
      {
        path: "ServerScriptService/TycoonController",
        file_type: "Script",
        service_location: "ServerScriptService",
        content: `local Players = game:GetService("Players")

local tycoon = workspace:WaitForChild("Tycoon", 10)
if not tycoon then return end

local buyer = tycoon:WaitForChild("Buyer")
local dropper = tycoon:WaitForChild("Dropper")
local conveyor = tycoon:WaitForChild("Conveyor")
local collector = tycoon:WaitForChild("Collector")
local spawnPoint = dropper:WaitForChild("SpawnPoint")

local cashValue = 0

collector.Touched:Connect(function(hit)
	if hit.Name == "CashDrop" then
		hit:Destroy()
		cashValue = cashValue + 10
	end
end)

local db = false
buyer.Touched:Connect(function(hit)
	local char = hit.Parent
	local player = Players:GetPlayerFromCharacter(char)
	if player and not db then
		db = true
		local leaderstats = player:FindFirstChild("leaderstats")
		if leaderstats then
			local cash = leaderstats:FindFirstChild("Cash")
			if cash then
				cash.Value = cash.Value + cashValue
				cashValue = 0
			end
		end
		task.wait(1)
		db = false
	end
end)

conveyor.AssemblyLinearVelocity = Vector3.new(0, 0, -10)

task.spawn(function()
	while true do
		task.wait(2)
		local part = Instance.new("Part")
		part.Name = "CashDrop"
		part.Size = Vector3.new(1, 1, 1)
		part.Position = spawnPoint.Position - Vector3.new(0, 2, 0)
		part.Color = Color3.fromRGB(80, 220, 80)
		part.Material = Enum.Material.Neon
		part.Parent = tycoon
	end
end)
`,
      },
    ],
    actions: [
      { type: "create", className: "Model", name: "Tycoon", parent: "Workspace" },
      {
        type: "create",
        className: "Part",
        name: "Floor",
        parent: "Workspace.Tycoon",
        properties: {
          Size: { __t: "Vector3", x: 40, y: 1, z: 40 },
          Position: { __t: "Vector3", x: 0, y: 0.5, z: 0 },
          Color: { __t: "Color3", r: 160, g: 160, b: 160 },
          Anchored: true,
        },
      },
      {
        type: "create",
        className: "Part",
        name: "Conveyor",
        parent: "Workspace.Tycoon",
        properties: {
          Size: { __t: "Vector3", x: 4, y: 1, z: 20 },
          Position: { __t: "Vector3", x: -10, y: 1.5, z: 0 },
          Color: { __t: "Color3", r: 40, g: 40, b: 40 },
          Anchored: true,
        },
      },
      {
        type: "create",
        className: "Part",
        name: "Collector",
        parent: "Workspace.Tycoon",
        properties: {
          Size: { __t: "Vector3", x: 6, y: 2, z: 4 },
          Position: { __t: "Vector3", x: -10, y: 1.5, z: -10 },
          Color: { __t: "Color3", r: 220, g: 80, b: 80 },
          Anchored: true,
        },
      },
      {
        type: "create",
        className: "Part",
        name: "Buyer",
        parent: "Workspace.Tycoon",
        properties: {
          Size: { __t: "Vector3", x: 4, y: 0.5, z: 4 },
          Position: { __t: "Vector3", x: -10, y: 1.5, z: -15 },
          Color: { __t: "Color3", r: 80, g: 220, b: 80 },
          Anchored: true,
        },
      },
      { type: "create", className: "Model", name: "Dropper", parent: "Workspace.Tycoon" },
      {
        type: "create",
        className: "Part",
        name: "SpawnPoint",
        parent: "Workspace.Tycoon.Dropper",
        properties: {
          Size: { __t: "Vector3", x: 4, y: 1, z: 4 },
          Position: { __t: "Vector3", x: -10, y: 8, z: 8 },
          Color: { __t: "Color3", r: 100, g: 100, b: 100 },
          Anchored: true,
        },
      },
    ],
  };
}

function getLeaderstatsTemplate() {
  return {
    message:
      "The standard leaderstats Script is queued for ServerScriptService with Coins and Cash stats.",
    files: [
      {
        path: "ServerScriptService/LeaderstatsSetup",
        file_type: "Script",
        service_location: "ServerScriptService",
        content: `local Players = game:GetService("Players")

Players.PlayerAdded:Connect(function(player)
	local leaderstats = Instance.new("Folder")
	leaderstats.Name = "leaderstats"
	leaderstats.Parent = player

	local coins = Instance.new("IntValue")
	coins.Name = "Coins"
	coins.Value = 0
	coins.Parent = leaderstats

	local cash = Instance.new("IntValue")
	cash.Name = "Cash"
	cash.Value = 0
	cash.Parent = leaderstats
end)
`,
      },
    ],
    actions: [],
  };
}

function getMapStarterTemplate(prompt: string): ExecuteResult {
  const title =
    prompt
      .replace(/[^a-zA-Z0-9 ]/g, " ")
      .trim()
      .split(/\s+/)
      .slice(0, 4)
      .join(" ") || "BloxSmith map";
  return {
    message: `The AI timed out, so I queued a focused starter version of ${title} in Workspace/Map with a Play-mode spawn. Run a smaller follow-up to add the next piece.`,
    files: [],
    actions: [
      { type: "create", className: "Folder", name: "Map", parent: "Workspace" },
      { type: "create", className: "Folder", name: "Buildings", parent: "Workspace/Map" },
      { type: "create", className: "Folder", name: "Roads", parent: "Workspace/Map" },
      { type: "create", className: "Folder", name: "Props", parent: "Workspace/Map" },
      {
        type: "spawn",
        name: "BloxsmithSpawn",
        parent: "Workspace/Map",
        position: { __t: "Vector3", x: 0, y: 6, z: 0 },
      },
      {
        type: "create_part",
        parent: "Workspace/Map",
        name: "PlayableGround",
        size: [160, 2, 160],
        position: [0, 0, 0],
        material: "Grass",
        color: [72, 160, 82],
        anchored: true,
      },
      {
        type: "create_part",
        parent: "Workspace/Map/Props",
        name: "BuildMarker",
        size: [10, 8, 10],
        position: [0, 5, -24],
        material: "Neon",
        color: [90, 170, 255],
        anchored: true,
      },
    ],
  };
}

function getGunTemplate(prompt: string): ExecuteResult {
  const name =
    /\b(pistol|rifle|shotgun|sniper|smg|ak|m4|gun|weapon|blaster)\b/i
      .exec(prompt)?.[0]
      ?.replace(/^./, (c) => c.toUpperCase()) || "Pistol";
  return {
    message: `The AI timed out, so I queued a working starter ${name} Tool in StarterPack. Equip it in Play mode — left click to fire a raycast shot with a tracer and damage.`,
    files: [
      {
        path: "ServerScriptService/Systems/GunHandler.server.lua",
        file_type: "Script",
        service_location: "ServerScriptService",
        content: `-- BloxSmith starter gun: raycast + tracer + damage

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Debris = game:GetService("Debris")

local remotes = ReplicatedStorage:FindFirstChild("Remotes") or Instance.new("Folder")
remotes.Name = "Remotes"
remotes.Parent = ReplicatedStorage

local fireRemote = remotes:FindFirstChild("GunFire") or Instance.new("RemoteEvent")
fireRemote.Name = "GunFire"
fireRemote.Parent = remotes

local DAMAGE = 20
local RANGE = 300
local COOLDOWN = 0.18
local lastFire = {}

fireRemote.OnServerEvent:Connect(function(player, origin, direction)
\tlocal now = tick()
\tif lastFire[player] and now - lastFire[player] < COOLDOWN then return end
\tlastFire[player] = now
\tif typeof(origin) ~= "Vector3" or typeof(direction) ~= "Vector3" then return end
\tlocal params = RaycastParams.new()
\tparams.FilterDescendantsInstances = { player.Character }
\tparams.FilterType = Enum.RaycastFilterType.Exclude
\tlocal result = workspace:Raycast(origin, direction.Unit * RANGE, params)
\tlocal hitPos = result and result.Position or (origin + direction.Unit * RANGE)
\tlocal beam = Instance.new("Part")
\tbeam.Anchored = true; beam.CanCollide = false; beam.Material = Enum.Material.Neon
\tbeam.Color = Color3.fromRGB(255, 220, 90)
\tbeam.Size = Vector3.new(0.15, 0.15, (hitPos - origin).Magnitude)
\tbeam.CFrame = CFrame.lookAt((origin + hitPos)/2, hitPos)
\tbeam.Parent = workspace
\tDebris:AddItem(beam, 0.08)
\tif result and result.Instance then
\t\tlocal hum = result.Instance.Parent and result.Instance.Parent:FindFirstChildOfClass("Humanoid")
\t\tif hum then hum:TakeDamage(DAMAGE) end
\tend
end)
`,
      },
      {
        path: `StarterPack/Tools/${name}/ClientGun.client.lua`,
        file_type: "LocalScript",
        service_location: `StarterPack/Tools/${name}`,
        content: `local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local UIS = game:GetService("UserInputService")
local tool = script.Parent
local player = Players.LocalPlayer
local fireRemote = ReplicatedStorage:WaitForChild("Remotes"):WaitForChild("GunFire")

local equipped = false
tool.Equipped:Connect(function() equipped = true end)
tool.Unequipped:Connect(function() equipped = false end)

tool.Activated:Connect(function()
\tif not equipped then return end
\tlocal cam = workspace.CurrentCamera
\tlocal origin = cam.CFrame.Position
\tlocal mousePos = UIS:GetMouseLocation()
\tlocal ray = cam:ViewportPointToRay(mousePos.X, mousePos.Y)
\tfireRemote:FireServer(origin, ray.Direction)
end)
`,
      },
    ],
    actions: [
      { type: "create", className: "Folder", name: "Tools", parent: "StarterPack" },
      { type: "create", className: "Folder", name: "Systems", parent: "ServerScriptService" },
      { type: "create", className: "Folder", name: "Remotes", parent: "ReplicatedStorage" },
      {
        type: "create",
        className: "Tool",
        name,
        parent: "StarterPack/Tools",
        props: {
          RequiresHandle: true,
          CanBeDropped: true,
          ToolTip: `${name} — left click to fire`,
        },
      },
      {
        type: "create_part",
        parent: `StarterPack/Tools/${name}`,
        name: "Handle",
        size: [0.6, 0.4, 2.2],
        position: [0, 0, 0],
        material: "Metal",
        color: [40, 40, 45],
        anchored: false,
      },
    ],
  };
}

function getLoadingScreenTemplate(prompt: string): ExecuteResult {
  const title = /["']([^"']{2,40})["']/.exec(prompt)?.[1] || "Loading...";
  return {
    message: `The AI timed out, so I queued a full-screen loading screen in StarterGui with a logo slot, progress bar, and fade-out when the game is ready.`,
    files: [
      {
        path: "StarterGui/LoadingScreen/Controller.client.lua",
        file_type: "LocalScript",
        service_location: "StarterGui/LoadingScreen",
        content: `-- BloxSmith starter loading screen
local Players = game:GetService("Players")
local ContentProvider = game:GetService("ContentProvider")
local TweenService = game:GetService("TweenService")
local RunService = game:GetService("RunService")

local gui = script.Parent
gui.IgnoreGuiInset = true
gui.ResetOnSpawn = false
gui.DisplayOrder = 9999

local frame = gui:WaitForChild("Backdrop")
local bar = frame:WaitForChild("BarBg"):WaitForChild("Fill")
local label = frame:WaitForChild("StatusLabel")

local assets = game:GetDescendants()
local total = math.max(#assets, 1)
local loaded = 0

for _, asset in ipairs(assets) do
\ttask.spawn(function()
\t\tpcall(function() ContentProvider:PreloadAsync({ asset }) end)
\t\tloaded += 1
\tend)
end

while loaded < total do
\tlocal pct = loaded / total
\tbar.Size = UDim2.new(pct, 0, 1, 0)
\tlabel.Text = string.format("Loading %d%%", math.floor(pct * 100))
\tRunService.Heartbeat:Wait()
end

bar.Size = UDim2.new(1, 0, 1, 0)
label.Text = "Ready"
task.wait(0.4)
local fade = TweenService:Create(frame, TweenInfo.new(0.6), { BackgroundTransparency = 1 })
fade:Play(); fade.Completed:Wait()
gui:Destroy()
`,
      },
    ],
    actions: [
      {
        type: "create",
        className: "ScreenGui",
        name: "LoadingScreen",
        parent: "StarterGui",
        props: { IgnoreGuiInset: true, ResetOnSpawn: false, DisplayOrder: 9999 },
      },
      {
        type: "create",
        className: "Frame",
        name: "Backdrop",
        parent: "StarterGui/LoadingScreen",
        props: {
          Size: { __t: "UDim2", xs: 1, xo: 0, ys: 1, yo: 0 },
          BackgroundColor3: { __t: "Color3", r: 10 / 255, g: 12 / 255, b: 18 / 255 },
          BorderSizePixel: 0,
        },
      },
      {
        type: "create",
        className: "TextLabel",
        name: "TitleLabel",
        parent: "StarterGui/LoadingScreen/Backdrop",
        props: {
          Size: { __t: "UDim2", xs: 0.8, xo: 0, ys: 0, yo: 80 },
          Position: { __t: "UDim2", xs: 0.1, xo: 0, ys: 0.32, yo: 0 },
          BackgroundTransparency: 1,
          Text: title,
          TextColor3: { __t: "Color3", r: 1, g: 1, b: 1 },
          TextScaled: true,
          Font: "GothamBold",
        },
      },
      {
        type: "create",
        className: "Frame",
        name: "BarBg",
        parent: "StarterGui/LoadingScreen/Backdrop",
        props: {
          Size: { __t: "UDim2", xs: 0.5, xo: 0, ys: 0, yo: 18 },
          Position: { __t: "UDim2", xs: 0.25, xo: 0, ys: 0.55, yo: 0 },
          BackgroundColor3: { __t: "Color3", r: 0.12, g: 0.14, b: 0.2 },
          BorderSizePixel: 0,
        },
      },
      {
        type: "create",
        className: "Frame",
        name: "Fill",
        parent: "StarterGui/LoadingScreen/Backdrop/BarBg",
        props: {
          Size: { __t: "UDim2", xs: 0, xo: 0, ys: 1, yo: 0 },
          BackgroundColor3: { __t: "Color3", r: 0.35, g: 0.7, b: 1 },
          BorderSizePixel: 0,
        },
      },
      {
        type: "create",
        className: "TextLabel",
        name: "StatusLabel",
        parent: "StarterGui/LoadingScreen/Backdrop",
        props: {
          Size: { __t: "UDim2", xs: 0.5, xo: 0, ys: 0, yo: 28 },
          Position: { __t: "UDim2", xs: 0.25, xo: 0, ys: 0.6, yo: 16 },
          BackgroundTransparency: 1,
          Text: "Loading 0%",
          TextColor3: { __t: "Color3", r: 0.8, g: 0.85, b: 0.95 },
          TextScaled: true,
          Font: "Gotham",
        },
      },
    ],
  };
}

function getSoundTemplate(prompt: string): ExecuteResult {
  const lower = prompt.toLowerCase();
  // Curated free Roblox library sound asset IDs by category.
  const library: Array<{
    test: RegExp;
    id: string;
    label: string;
    volume?: number;
    looped?: boolean;
  }> = [
    {
      test: /\b(gun|pistol|shoot|shot|fire|blast)\b/,
      id: "rbxassetid://131961136",
      label: "Gunshot",
    },
    {
      test: /\b(explos|boom|bomb|grenade|tnt)\b/,
      id: "rbxassetid://138186576",
      label: "Explosion",
    },
    {
      test: /\b(coin|pickup|collect|ding|reward)\b/,
      id: "rbxassetid://131323304",
      label: "Coin pickup",
    },
    { test: /\b(click|button|tap|ui|press)\b/, id: "rbxassetid://6895079853", label: "UI click" },
    { test: /\b(jump|hop)\b/, id: "rbxassetid://9125402735", label: "Jump" },
    {
      test: /\b(footstep|walk|step|run)\b/,
      id: "rbxassetid://9125604850",
      label: "Footsteps",
      looped: true,
    },
    { test: /\b(hit|punch|hurt|damage|impact)\b/, id: "rbxassetid://5810753638", label: "Hit" },
    {
      test: /\b(death|die|dead|defeat|lose)\b/,
      id: "rbxassetid://5982740659",
      label: "Death sting",
    },
    {
      test: /\b(win|victory|level\s*up|complete|success)\b/,
      id: "rbxassetid://9125483735",
      label: "Victory",
    },
    {
      test: /\b(swing|sword|slash|blade|katana)\b/,
      id: "rbxassetid://12222216",
      label: "Sword swing",
    },
    { test: /\b(reload)\b/, id: "rbxassetid://5755085759", label: "Gun reload" },
    { test: /\b(door|open|close)\b/, id: "rbxassetid://9114126435", label: "Door open" },
    {
      test: /\b(notif|message|popup|alert)\b/,
      id: "rbxassetid://6042053626",
      label: "Notification",
    },
    { test: /\b(thunder|lightning|storm)\b/, id: "rbxassetid://133997824", label: "Thunder" },
    {
      test: /\b(rain|water|drip)\b/,
      id: "rbxassetid://131961134",
      label: "Rain",
      looped: true,
      volume: 0.5,
    },
    {
      test: /\b(wind|breeze|whoosh)\b/,
      id: "rbxassetid://9114223905",
      label: "Wind",
      looped: true,
      volume: 0.4,
    },
    {
      test: /\b(fire|flame|burn|torch)\b/,
      id: "rbxassetid://9112854440",
      label: "Fire crackle",
      looped: true,
      volume: 0.5,
    },
    {
      test: /\b(horror|scary|spooky|creepy|ambient.*dark)\b/,
      id: "rbxassetid://9046657432",
      label: "Horror ambience",
      looped: true,
      volume: 0.6,
    },
    {
      test: /\b(epic|battle|boss|combat).*music\b|\bbattle\s*music\b/,
      id: "rbxassetid://1837854082",
      label: "Epic battle music",
      looped: true,
      volume: 0.5,
    },
    {
      test: /\b(lobby|menu|chill|calm).*music\b|\blobby\s*music\b/,
      id: "rbxassetid://1837799774",
      label: "Lobby music",
      looped: true,
      volume: 0.5,
    },
    {
      test: /\b(music|song|bgm|background\s*music|soundtrack)\b/,
      id: "rbxassetid://1837854082",
      label: "Background music",
      looped: true,
      volume: 0.5,
    },
    {
      test: /\b(beep|alarm|siren)\b/,
      id: "rbxassetid://3744371091",
      label: "Alarm beep",
      looped: true,
      volume: 0.6,
    },
    { test: /\b(teleport|warp|portal|magic)\b/, id: "rbxassetid://9113878839", label: "Teleport" },
    { test: /\b(heal|potion|drink)\b/, id: "rbxassetid://9120154083", label: "Heal" },
    { test: /\b(laser|beam|sci-?fi|sci\s*fi)\b/, id: "rbxassetid://9059409580", label: "Laser" },
  ];
  const match = library.find((s) => s.test.test(lower)) ?? library[library.length - 1];
  const name = /["']([^"']{2,40})["']/.exec(prompt)?.[1] || match.label.replace(/\s+/g, "");
  const looped = match.looped ?? /\b(loop|background|ambient|bgm|music|soundtrack)\b/.test(lower);
  const volume = match.volume ?? 0.7;
  const playOnSpawn = /\b(play|start|auto|on\s*spawn|when.*join)\b/.test(lower) || looped;

  return {
    message: `Queued a Sound (${match.label}) under SoundService named "${name}"${looped ? ", looping" : ""}${playOnSpawn ? ", auto-playing for every player" : ""}. Tweak the SoundId or volume any time.`,
    files: playOnSpawn
      ? [
          {
            path: `StarterPlayer/StarterPlayerScripts/Play_${name}.client.lua`,
            file_type: "LocalScript",
            service_location: "StarterPlayer/StarterPlayerScripts",
            content: `-- BloxSmith sound player\nlocal SoundService = game:GetService("SoundService")\nlocal sound = SoundService:WaitForChild("${name}")\nif not sound.IsPlaying then sound:Play() end\n`,
          },
        ]
      : [],
    actions: [
      {
        type: "create",
        className: "Sound",
        name,
        parent: "SoundService",
        properties: {
          SoundId: match.id,
          Volume: volume,
          Looped: looped,
          Playing: false,
        },
      },
    ],
  };
}

function getFocusedFallbackTemplate(prompt: string): ExecuteResult {
  const lower = prompt.toLowerCase();
  // Only return a template when the prompt clearly asks for that specific thing.
  // Otherwise return an honest error — never dump random grass/trees/maps the user did NOT ask for.
  if (/\b(gun|pistol|rifle|shotgun|sniper|smg|ak|m4|weapon|blaster|firearm)\b/.test(lower))
    return getGunTemplate(prompt);
  if (/\bloading\s*screen|splash\s*screen|intro\s*screen|title\s*screen\b/.test(lower))
    return getLoadingScreenTemplate(prompt);
  if (/\b(sound|sfx|audio|music|bgm|soundtrack|noise)\b/.test(lower))
    return getSoundTemplate(prompt);
  if (/\bshop|store\b/.test(lower)) return getShopTemplate() as ExecuteResult;
  if (/\bobby|parkour\b/.test(lower)) return getObbyTemplate() as ExecuteResult;
  if (/\btycoon\b/.test(lower)) return getTycoonTemplate() as ExecuteResult;
  if (/\bcoin|coins|currency\b/.test(lower)) return getCoinsTemplate() as ExecuteResult;
  if (/\bnpc|dummy\b/.test(lower)) return getNpcTemplate() as ExecuteResult;
  if (/\btree|forest\b/.test(lower)) return getTreesTemplate() as ExecuteResult;
  if (/\bgrass\b/.test(lower)) return getGrassTemplate() as ExecuteResult;
  if (/\b(map|baseplate|starter\s*map|terrain|world)\b/.test(lower))
    return getMapStarterTemplate(prompt);
  // No reliable match — refuse to invent random content. Tell the user honestly.
  return {
    message:
      "The AI couldn't finish this build in time and I won't drop random parts into your game. Please try again, or break the request into a smaller step (e.g. 'just the main menu button', 'just the sword tool').",
    files: [],
    actions: [],
  };
}

function getInstantTemplateForPrompt(cleanedPrompt: string): ExecuteResult | null {
  const simple =
    cleanedPrompt.length <= 80 &&
    !/\b(custom|advanced|complex|complete|full game|entire game)\b/.test(cleanedPrompt);
  if (!simple) return null;

  if (
    /^(add|make|create|build|give me)\s+(a\s+|an\s+)?(basic\s+|simple\s+)?grass\b/.test(
      cleanedPrompt,
    )
  ) {
    return getGrassTemplate() as ExecuteResult;
  }
  if (
    /^(add|make|create|build|give me)\s+(a\s+|an\s+)?(basic\s+|simple\s+)?trees?\b/.test(
      cleanedPrompt,
    )
  ) {
    return getTreesTemplate() as ExecuteResult;
  }
  if (
    /^(add|make|create|build|give me)\s+(a\s+|an\s+)?(basic\s+|simple\s+)?coins?\b/.test(
      cleanedPrompt,
    )
  ) {
    return getCoinsTemplate() as ExecuteResult;
  }
  if (
    /^(add|make|create|build|give me)\s+(a\s+|an\s+)?(basic\s+|simple\s+)?(shop|store|shop gui|store gui)\b/.test(
      cleanedPrompt,
    )
  ) {
    return getShopTemplate() as ExecuteResult;
  }
  if (
    /^(add|make|create|build|give me)\s+(a\s+|an\s+)?(basic\s+|simple\s+)?npc\b/.test(cleanedPrompt)
  ) {
    return getNpcTemplate() as ExecuteResult;
  }
  if (
    /^(add|make|create|build|give me)\s+(a\s+|an\s+)?(basic\s+|simple\s+)?obby\b/.test(
      cleanedPrompt,
    )
  ) {
    return getObbyTemplate() as ExecuteResult;
  }
  if (
    /^(add|make|create|build|give me)\s+(a\s+|an\s+)?(basic\s+|simple\s+)?tycoon\b/.test(
      cleanedPrompt,
    )
  ) {
    return getTycoonTemplate() as ExecuteResult;
  }
  if (
    /^(add|make|create|build|give me)\s+(a\s+|an\s+)?(basic\s+|simple\s+)?leaderstats\b/.test(
      cleanedPrompt,
    )
  ) {
    return getLeaderstatsTemplate() as ExecuteResult;
  }
  return null;
}

function pickFastTools(prompt: string, ctx: { projectId: string; userId: string }) {
  const allTools = buildBloxSmithTools(ctx) as Record<string, any>;
  const lower = prompt.toLowerCase();
  const picked: Record<string, any> = {};
  const add = (name: string) => {
    if (allTools[name]) picked[name] = allTools[name];
  };
  if (
    /\[web search enabled\]|search the web|look up|current|docs|documentation|api/i.test(prompt)
  ) {
    add("roblox_docs_search");
    add("web_search");
    add("fetch_url");
  }
  if (
    /\b(datastore|remoteevent|remotefunction|marketplaceservice|pathfindingservice|tweenservice|runservice|animation|animator|humanoid|screen.?gui|luau|creator hub|api reference)\b/i.test(
      prompt,
    )
  ) {
    add("roblox_docs_search");
  }
  if (/thumbnail|icon|logo|decal|artwork|poster|banner|loading screen/i.test(prompt)) {
    add("generate_image");
  }
  if (
    /\b(toolbox|creator store|free model|asset|model id|insert model|use a model|marketplace|map asset|lobby asset|prop|skybox|music|sound)\b/i.test(
      lower,
    )
  ) {
    add("roblox_asset_search");
  }
  if (
    /\b(asset info|asset details|verify asset|thumbnail|preview|safe model|scan scripts?)\b/i.test(
      lower,
    )
  ) {
    add("roblox_asset_info");
    add("roblox_asset_thumbnail");
  }
  if (/\bmcp\b|bsmcp_|mcp server|mcp token/i.test(prompt)) {
    add("list_mcp_servers");
    add("add_mcp_server");
    add("update_mcp_server");
    add("remove_mcp_server");
  }
  return picked;
}

// Map Groq returned actions to plugin-expected actions
function coerceActionValue(key: string, val: any): any {
  if (Array.isArray(val)) {
    if (key.toLowerCase().includes("color") && val.length === 3) {
      return { __t: "Color3", r: val[0], g: val[1], b: val[2] };
    }
    if (
      (key.toLowerCase().includes("size") || key.toLowerCase().includes("position")) &&
      val.length === 3
    ) {
      return { __t: "Vector3", x: val[0], y: val[1], z: val[2] };
    }
  }
  return val;
}

async function resolveSearchQueries(actions: any[]): Promise<any[]> {
  const { searchRobloxAssets } = await import("@/lib/ai-tools.server");
  const resolved: any[] = [];
  for (const a of actions) {
    if (a && a.type === "insert_toolbox_asset" && a.searchQuery && !a.assetId) {
      try {
        const items = await searchRobloxAssets(a.searchQuery, a.category || "Models", 5, {
          freeOnly: true,
          verifiedOnly: false,
        });
        if (items.length > 0) {
          const best = items[0];
          resolved.push({ ...a, assetId: best.assetId, name: a.name || best.name });
          console.log(
            `[Execute API] Resolved searchQuery "${a.searchQuery}" → assetId ${best.assetId} ("${best.name}")`,
          );
          continue;
        } else {
          console.warn(`[Execute API] No free toolbox results for "${a.searchQuery}" — skipping`);
        }
      } catch (err) {
        console.error("Error resolving searchQuery for insert_toolbox_asset:", err);
      }
    }
    resolved.push(a);
  }
  // Drop unresolved toolbox actions (no assetId + no searchQuery match) so we
  // don't queue a no-op insertion the plugin will reject.
  return resolved.filter((a) => !(a && a.type === "insert_toolbox_asset" && !a.assetId));
}

function mapGroqActionsToPlugin(actions: any[]): GenAction[] {
  const mapped: GenAction[] = [];

  for (const a of actions) {
    if (!a || typeof a !== "object") continue;

    const type = a.type || a.action_type;
    if (!type) continue;

    if (type === "create_part") {
      mapped.push({
        type: "create",
        className: "Part",
        name: a.name || "Part",
        parent: a.parent || "Workspace",
        properties: {
          Size: { __t: "Vector3", x: a.size?.[0] ?? 4, y: a.size?.[1] ?? 1, z: a.size?.[2] ?? 4 },
          Position: {
            __t: "Vector3",
            x: a.position?.[0] ?? 0,
            y: a.position?.[1] ?? 0,
            z: a.position?.[2] ?? 0,
          },
          Material: { __t: "Enum", enum: "Material", value: a.material || "Plastic" },
          Color: {
            __t: "Color3",
            r: a.color?.[0] ?? 163,
            g: a.color?.[1] ?? 162,
            b: a.color?.[2] ?? 165,
          },
          Anchored: a.anchored !== false,
          ...(a.properties || {}),
        },
      });
    } else if (type === "create_model") {
      mapped.push({
        type: "create",
        className: "Model",
        name: a.name || "Model",
        parent: a.parent || "Workspace",
        properties: {
          ...(a.properties || {}),
        },
      });
    } else if (type === "create_folder") {
      mapped.push({
        type: "create",
        className: "Folder",
        name: a.name || "Folder",
        parent: a.parent || "Workspace",
        properties: {
          ...(a.properties || {}),
        },
      });
    } else if (
      type === "create_script" ||
      type === "create_local_script" ||
      type === "create_module_script"
    ) {
      const cls =
        type === "create_local_script"
          ? "LocalScript"
          : type === "create_module_script"
            ? "ModuleScript"
            : "Script";
      mapped.push({
        type: "script",
        className: cls,
        name: a.name || "Script",
        parent: a.parent || "ServerScriptService",
        source: a.source || a.content || "",
      });
    } else if (type === "create_remote_event") {
      mapped.push({
        type: "create",
        className: "RemoteEvent",
        name: a.name || "RemoteEvent",
        parent: a.parent || "ReplicatedStorage",
      });
    } else if (type === "create_gui") {
      mapped.push({
        type: "create",
        className: a.className || "ScreenGui",
        name: a.name || "ScreenGui",
        parent: a.parent || "StarterGui",
        properties: a.properties || {},
      });
    } else if (type === "create_terrain") {
      mapped.push({
        type: "terrainFill",
        material: a.material || "Grass",
        size: {
          __t: "Vector3",
          x: a.size?.[0] ?? 100,
          y: a.size?.[1] ?? 10,
          z: a.size?.[2] ?? 100,
        },
        cframe: {
          __t: "CFrame",
          x: a.position?.[0] ?? 0,
          y: a.position?.[1] ?? 0,
          z: a.position?.[2] ?? 0,
        },
      });
    } else if (type === "set_property") {
      const props: any = {};
      if (a.property && a.value !== undefined) {
        props[a.property] = coerceActionValue(a.property, a.value);
      }
      if (a.properties) {
        for (const k of Object.keys(a.properties)) {
          props[k] = coerceActionValue(k, a.properties[k]);
        }
      }
      mapped.push({
        type: "set",
        path: a.path,
        properties: props,
      });
    } else if (type === "move_object") {
      mapped.push({
        type: "move",
        path: a.path,
        newParent: a.newParent || a.parent || "Workspace",
      });
    } else if (type === "rename_object") {
      mapped.push({
        type: "rename",
        path: a.path,
        newName: a.newName || a.name,
      });
    } else if (type === "delete_object") {
      mapped.push({
        type: "delete",
        path: a.path,
      });
    } else if (type === "organize_folder") {
      const folderName = a.folderName || a.name || "OrganizedFolder";
      mapped.push({
        type: "organize",
        container: a.container || "Folder",
        name: folderName,
        parent: a.parent || "Workspace",
        items: a.objects || a.items || [],
      });
    } else {
      mapped.push(a);
    }
  }

  return mapped;
}

// Detect dangerous actions
function detectDangerousActions(files: GenFile[], actions: GenAction[]): string[] {
  const dangers: string[] = [];

  for (const a of actions) {
    if (a.type === "delete") {
      const path = (a.path || "").trim();
      const lower = path.toLowerCase();
      dangers.push(`Delete requires confirmation in Studio: ${path || "(unknown path)"}`);
      if (
        lower === "workspace" ||
        lower === "serverscriptservice" ||
        lower === "replicatedstorage" ||
        lower === "startergui"
      ) {
        dangers.push(`Deleting a top-level service: ${path}`);
      }
    }
    if (a.type === "terrainClear") {
      dangers.push("Clearing all terrain");
    }
  }

  const scriptCount =
    files.filter(
      (f) =>
        f.file_type === "Script" || f.file_type === "LocalScript" || f.file_type === "ModuleScript",
    ).length +
    actions.filter(
      (a) =>
        a.type === "script" ||
        a.type === "create_script" ||
        a.type === "create_local_script" ||
        a.type === "create_module_script",
    ).length;
  if (scriptCount > 20) {
    dangers.push(`Mass script insertion: creating ${scriptCount} scripts at once`);
  }

  for (const f of files) {
    if (f.content && /HttpService|GetAsync|PostAsync|RequestAsync|http\s*:/i.test(f.content)) {
      dangers.push(`Script ${f.path} accesses external web services (HttpService)`);
    }
  }
  for (const a of actions) {
    if (a.source && /HttpService|GetAsync|PostAsync|RequestAsync|http\s*:/i.test(a.source)) {
      dangers.push(
        `Action script ${a.name || "unnamed"} accesses external web services (HttpService)`,
      );
    }
  }

  return dangers;
}

// Groq JSON parser helper
function tryParseJSON(raw: string): any {
  let cleaned = raw.trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || start >= end) {
    throw new Error("No JSON object structure found");
  }
  cleaned = cleaned.substring(start, end + 1);

  try {
    return JSON.parse(cleaned);
  } catch (e) {
    const repaired = cleaned.replace(/,\s*([}\]])/g, "$1");
    try {
      return JSON.parse(repaired);
    } catch {
      throw e;
    }
  }
}

async function repairJsonWithGroq(badJson: string, gateway: any, model: any): Promise<any> {
  const repairPrompt = `The following text was supposed to be a valid JSON object matching the Roblox assistant format, but it failed to parse. Repair it and return ONLY the corrected valid JSON object. Do not include markdown formatting or explanations.

Bad text:
${badJson}`;

  const { text } = await generateText({
    model,
    prompt: repairPrompt,
    maxRetries: 0,
    maxOutputTokens: 3000,
    timeout: { totalMs: 8000 },
  });

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Repair failed: no JSON found");
  return tryParseJSON(jsonMatch[0]);
}
// Retry wrapper for transient Groq failures (rate limit / 5xx).
// Exponential backoff: 500ms, 1s, 2s. Skips retry for fatal errors (401/402/413/context-too-large).
async function withRateLimitRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const delays = [500, 1000, 2000];
  let lastErr: any = null;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;
      const msg = String(err?.message ?? err);
      const status = err?.status ?? err?.statusCode;
      const is429 = status === 429 || /\b429\b|rate.?limit|too many requests|tpm/i.test(msg);
      const is5xx =
        (status >= 500 && status < 600) ||
        /\b50\d\b|service unavailable|bad gateway|timeout/i.test(msg);
      const isFatal =
        status === 401 || status === 402 || status === 413 || /too large|context length/i.test(msg);
      if (isFatal || (!is429 && !is5xx) || attempt === delays.length) throw err;
      const delay = delays[attempt] + Math.floor(Math.random() * 250);
      console.warn(
        `[${label}] transient error (attempt ${attempt + 1}), retrying in ${delay}ms: ${msg.slice(0, 200)}`,
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

function classifyProviderError(
  err: any,
): "timeout" | "context" | "rate_limit" | "tool" | "json" | "provider" | "unknown" {
  const msg = String(err?.message ?? err);
  const status = err?.status ?? err?.statusCode;
  if (err?.name === "AbortError" || /aborted|abort|timeout|timed out/i.test(msg)) return "timeout";
  if (status === 413 || /too large|context length|maximum context|token limit|tpm/i.test(msg))
    return "context";
  if (status === 429 || /\b429\b|rate.?limit|too many requests/i.test(msg)) return "rate_limit";
  if (
    /tool[_ ]use|tool call|function calling|tools? (are|is) not supported|invalid tool|unsupported.*tool/i.test(
      msg,
    )
  )
    return "tool";
  if (/json|no json object|unexpected end|unterminated|truncated/i.test(msg)) return "json";
  if (typeof status === "number" && status >= 500) return "provider";
  return "unknown";
}

export const Route = createFileRoute("/execute")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) =>
        new Response(null, { status: 204, headers: getCorsHeaders(request) }),
      POST: async ({ request }) => {
        const corsHeaders = getCorsHeaders(request);
        const charged = { current: false };
        let refundOnFailure: ((reason: string) => Promise<void>) | null = null;
        try {
          const authHeader = request.headers.get("authorization");
          if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return new Response(JSON.stringify({ error: "Unauthorized" }), {
              status: 401,
              headers: corsHeaders,
            });
          }

          const supabaseUrl = process.env.SUPABASE_URL;
          const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY;
          if (!supabaseUrl || !supabaseKey) {
            const missing = [
              ...(!supabaseUrl ? ["SUPABASE_URL"] : []),
              ...(!supabaseKey ? ["SUPABASE_PUBLISHABLE_KEY"] : []),
            ];
            return new Response(
              JSON.stringify({
                error: `Missing Supabase environment variable(s): ${missing.join(", ")}`,
              }),
              { status: 500, headers: corsHeaders },
            );
          }

          const token = authHeader.replace("Bearer ", "");
          const supabaseUser: SupabaseClient<Database> = createClient<Database>(
            supabaseUrl,
            supabaseKey,
            {
              global: { headers: { Authorization: `Bearer ${token}` } },
              auth: {
                storage: undefined,
                persistSession: false,
                autoRefreshToken: false,
              },
            },
          );
          const {
            data: { user },
            error: authErr,
          } = await supabaseUser.auth.getUser(token);
          const userId = user?.id ?? null;

          if (authErr || !userId) {
            return new Response(JSON.stringify({ error: "Unauthorized" }), {
              status: 401,
              headers: corsHeaders,
            });
          }

          const body = await request.json().catch(() => ({}));
          const { projectId, prompt, autoExecute, studioConnected, thinking, aiMode, attachments } =
            body;
          // Vision: optional list of data URLs (data:image/...;base64,...) sent
          // from the chat composer's attach-image button. Cap to 4 images so we
          // don't blow the context window.
          const visionImages: string[] = Array.isArray(attachments)
            ? attachments
                .filter(
                  (x: unknown): x is string => typeof x === "string" && x.startsWith("data:image/"),
                )
                .slice(0, 4)
            : [];

          if (!projectId || !prompt) {
            return new Response(JSON.stringify({ error: "Missing projectId or prompt" }), {
              status: 400,
              headers: corsHeaders,
            });
          }

          // Resolve optional AI mode addendum (Build/Fix/Debug/Polish/UI/etc.)
          const { getAiModeAddendum } = await import("@/lib/ai-modes");
          const modeAddendum = getAiModeAddendum(typeof aiMode === "string" ? aiMode : null);

          // Projects are private: only the owning user can run AI against them.
          const { data: project, error: projectErr } = await supabaseUser
            .from("projects")
            .select("id,user_id,name,ai_rules")
            .eq("id", projectId)
            .eq("user_id", userId)
            .maybeSingle();
          if (projectErr || !project)
            return new Response(JSON.stringify({ error: "Project not found" }), {
              status: 404,
              headers: corsHeaders,
            });
          const projectRules =
            typeof (project as any).ai_rules === "string"
              ? String((project as any).ai_rules)
                  .trim()
                  .slice(0, 4000)
              : "";

          // Spend Credits
          const cost = 3;
          const { data: roles } = await supabaseUser
            .from("user_roles")
            .select("role")
            .eq("user_id", userId);
          const isOwner = (roles ?? []).some((r) => r.role === "owner" || r.role === "admin");

          if (!isOwner) {
            // Rolling-window rate limits (5h + weekly). Owners exempt.
            const { error: rlErr } = await supabaseUser.rpc("check_and_record_ai_usage" as never);
            if (rlErr) {
              const msg = rlErr.message || "";
              if (msg.includes("rate_limited_5h")) {
                return new Response(
                  JSON.stringify({
                    error:
                      "You've hit your 5-hour message limit. It resets soon — check the usage panel for the exact time.",
                  }),
                  { status: 429, headers: corsHeaders },
                );
              }
              if (msg.includes("rate_limited_7d")) {
                return new Response(
                  JSON.stringify({
                    error:
                      "You've hit your weekly message limit. It resets in the next few days — check the usage panel.",
                  }),
                  { status: 429, headers: corsHeaders },
                );
              }
              return new Response(JSON.stringify({ error: "Usage check failed. Try again." }), {
                status: 500,
                headers: corsHeaders,
              });
            }

            const { error: spendErr } = await supabaseUser.rpc("spend_credits_atomic", {
              _amount: cost,
            });
            if (spendErr) {
              return new Response(
                JSON.stringify({ error: "Not enough credits. Buy more on the Pricing page." }),
                { status: 402, headers: corsHeaders },
              );
            }
            charged.current = true;
          }
          refundOnFailure = (reason: string) =>
            maybeRefundCredits(charged, supabaseUser, isOwner, cost, reason);

          // Check instant templates
          let result: ExecuteResult | null = null;
          let aiActivity: Array<{ tool: string; summary: string; ok: boolean }> = [];
          const cleanedPrompt = prompt.toLowerCase().trim();

          result =
            getInstantTemplateForPrompt(cleanedPrompt) ??
            (cleanedPrompt === "grass" || cleanedPrompt.includes("add grass around my baseplate")
              ? getGrassTemplate()
              : cleanedPrompt === "tree" || cleanedPrompt === "trees"
                ? getTreesTemplate()
                : cleanedPrompt === "coin" || cleanedPrompt === "coins"
                  ? getCoinsTemplate()
                  : cleanedPrompt === "shop"
                    ? getShopTemplate()
                    : cleanedPrompt === "npc"
                      ? getNpcTemplate()
                      : cleanedPrompt === "obby"
                        ? getObbyTemplate()
                        : cleanedPrompt === "tycoon"
                          ? getTycoonTemplate()
                          : cleanedPrompt === "leaderstats"
                            ? getLeaderstatsTemplate()
                            : null);

          // If no instant template, call AI through the resolved gateway
          // (per-project setting: built-in Groq, or user's own API key for
          // OpenAI / Anthropic / Google / Groq).
          if (!result) {
            // Resolve the gateway for THIS user + project. Falls back to
            // built-in Groq if no api_key mode configured or key missing.
            let resolved;
            try {
              resolved = await resolveAiGateway({
                userId,
                projectId,
                kind: "build",
                thinking: !!thinking,
              });
            } catch (e: any) {
              await refundOnFailure("ai gateway not configured");
              throw new Error(e?.message || "AI gateway not configured.");
            }
            console.log(
              `[ai-execute] resolved gateway source=${resolved.source} provider=${resolved.provider} model=${resolved.modelName}`,
            );
            // Keep a Groq provider handle around ONLY for the size-fallback
            // path (which needs gpt-oss-120b). External-key sources don't get
            // the fallback — they use the user's chosen model directly.
            const apiKey = process.env.GROQ_API_KEY;
            if (true) {
              try {
                const gateway = apiKey ? createGroqProvider(apiKey) : null;

                const [liveContextResult, existingFilesResult, convoRowResult, memoryBlock] =
                  await Promise.all([
                    supabaseUser
                      .from("plugin_context")
                      .select("context,instance_count,updated_at")
                      .eq("project_id", projectId)
                      .maybeSingle(),
                    supabaseUser
                      .from("project_files")
                      .select("path,file_type,service_location,content")
                      .eq("project_id", projectId)
                      .limit(60),
                    supabaseUser
                      .from("agent_conversations")
                      .select("id")
                      .eq("project_id", projectId)
                      .order("created_at", { ascending: true })
                      .limit(1)
                      .maybeSingle(),
                    buildProjectMemoryBlock(supabaseUser, projectId, { limit: 10, maxChars: 1200 }),
                  ]);
                const liveContext = liveContextResult.data;
                const existingFiles = existingFilesResult.data;
                const convoRow = convoRowResult.data;

                // Pull recent chat history.
                let history: { role: "user" | "assistant"; content: string }[] = [];
                if (convoRow?.id) {
                  const { data: msgs } = await supabaseUser
                    .from("agent_messages")
                    .select("role,content,created_at,actions")
                    .eq("conversation_id", convoRow.id)
                    .order("created_at", { ascending: false })
                    .limit(20);
                  history = (msgs ?? [])
                    .reverse()
                    .filter((m: any) => m.role === "user" || m.role === "assistant")
                    .map((m: any) => {
                      // Multi-step build memory: prepend a compact build-outcome
                      // summary to prior assistant turns so the next turn knows
                      // exactly what was already built / queued / reverted. Keeps
                      // the AI from re-creating files it already produced.
                      let content = String(m.content ?? "");
                      if (m.role === "assistant" && m.actions && typeof m.actions === "object") {
                        const a: any = m.actions;
                        const parts: string[] = [];
                        if (typeof a.files === "number" && a.files > 0)
                          parts.push(`${a.files} file${a.files === 1 ? "" : "s"}`);
                        if (typeof a.actions === "number" && a.actions > 0)
                          parts.push(`${a.actions} studio action${a.actions === 1 ? "" : "s"}`);
                        if (a.reverted === true) parts.push("REVERTED by user");
                        if (parts.length > 0) {
                          const snap: any[] = Array.isArray(a.snapshot) ? a.snapshot : [];
                          const paths = snap
                            .slice(0, 6)
                            .map((s: any) => s?.path)
                            .filter((p: any) => typeof p === "string");
                          const pathHint = paths.length
                            ? ` [${paths.join(", ")}${snap.length > 6 ? `, +${snap.length - 6} more` : ""}]`
                            : "";
                          content = `[Built: ${parts.join(", ")}${pathHint}] ${content}`;
                        }
                      }
                      return { role: m.role as "user" | "assistant", content };
                    });
                }

                const keywords = extractKeywords(prompt);
                const ctxInputs: ContextInputs = {
                  prompt,
                  studioConnected: !!studioConnected,
                  liveContext: liveContext?.context ?? null,
                  liveUpdatedAt: liveContext?.updated_at,
                  liveInstanceCount: liveContext?.instance_count,
                  files: (existingFiles ?? []) as DbFile[],
                  history,
                  keywords,
                  memoryBlock,
                };

                // Build attempts. For external API-key sources we use a
                // single attempt with the user's chosen model. For built-in
                // (groq) source we keep the 3-step compression ladder.
                type Attempt = {
                  level: 0 | 1 | 2 | 3;
                  modelId: string;
                  budget: number;
                  useResolved: boolean;
                };
                // Detect build-heavy intent. The full system prompt carries
                // the Universal Builder Mandate, UI polish recipe, and toolbox
                // workflow — worth its ~10k tokens for full builds, but pure
                // overhead for "add a part" or "fix this script" requests.
                // Also drives model selection: heavy builds get the 70B from
                // attempt #0 instead of waiting for the 8B to fail first.
                const wantsFullPrompt =
                  !!thinking ||
                  /\b(game|tycoon|simulator|obby|shop|inventory|menu|hud|loading|splash|main\s*menu|settings|cutscene|quest|admin|rpg|combat|weapon|npc|enemy|boss|pet|map|world|city|lobby|tower\s*defense)\b/i.test(
                    prompt,
                  );

                const resolvedBudget = getModelProfile(resolved.provider, resolved.modelName, {
                  thinking: !!thinking,
                }).inputTokenBudget;
                const hasGroqFallback = !!apiKey;
                const largeBudget = getModelProfile(
                  hasGroqFallback ? "groq" : resolved.provider,
                  hasGroqFallback ? BLOXSMITH_LARGE_MODEL : resolved.modelName,
                  {
                    thinking: !!thinking,
                    retry: true,
                  },
                ).inputTokenBudget;
                // For built-in (groq) mode, upgrade the first attempt from the
                // small fast model to the large model when the request is
                // build-heavy. This skips a wasted 8B attempt that would
                // produce a generic or broken JSON response, and goes
                // straight to the model that can actually handle the work.
                const builtInLevel0Model =
                  wantsFullPrompt && hasGroqFallback ? BLOXSMITH_LARGE_MODEL : resolved.modelName;
                const builtInLevel0Budget =
                  wantsFullPrompt && hasGroqFallback
                    ? largeBudget
                    : resolvedBudget || BLOXSMITH_MODEL_TOKEN_BUDGET;
                const attempts: Attempt[] =
                  resolved.source === "api_key"
                    ? [
                        // Single attempt for user-key mode — the 2nd attempt nearly
                        // doubled wall time on every build. If level 1 errors with a
                        // too-large signal, the loop below escalates to level 3.
                        {
                          level: 1,
                          modelId: resolved.modelName,
                          budget: resolvedBudget,
                          useResolved: true,
                        },
                        {
                          level: 3,
                          modelId: resolved.modelName,
                          budget: resolvedBudget,
                          useResolved: true,
                        },
                      ]
                    : [
                        // Fast path: one attempt with the small model, one with the large
                        // model as a fallback. Four attempts blew past Cloudflare's
                        // worker wall-time and caused 502s. Build-heavy requests skip
                        // straight to the large model on attempt #0.
                        {
                          level: 0,
                          modelId: builtInLevel0Model,
                          budget: builtInLevel0Budget,
                          useResolved: !wantsFullPrompt || !hasGroqFallback,
                        },
                        {
                          level: 2,
                          modelId: hasGroqFallback ? BLOXSMITH_LARGE_MODEL : resolved.modelName,
                          budget: largeBudget || BLOXSMITH_LARGE_MODEL_TOKEN_BUDGET,
                          useResolved: !hasGroqFallback,
                        },
                      ];

                const systemTokens = estimateTokens(SYSTEM_PROMPT);
                const slimSystemTokens = estimateTokens(SLIM_SYSTEM_PROMPT);
                let lastErr: any = null;
                let rawText = "";

                for (let i = 0; i < attempts.length; i++) {
                  const att = attempts[i];
                  const built = buildContextBlock(att.level, ctxInputs);
                  // Prompt selection: slim by default for speed; full prompt
                  // when the request needs the build mandate, or on a later
                  // retry attempt where we already escalated context.
                  const fullPromptTokens =
                    systemTokens +
                    estimateTokens(built.contextBlock) +
                    built.trimmedHistory.reduce((sum, m) => sum + estimateTokens(m.content), 0);
                  const wantFull = wantsFullPrompt || att.level >= 2;
                  const useSlim = !wantFull || fullPromptTokens > att.budget;
                  const baseSystem = useSlim ? SLIM_SYSTEM_PROMPT : SYSTEM_PROMPT;
                  const baseSystemTokens = useSlim ? slimSystemTokens : systemTokens;
                  const promptTokens =
                    baseSystemTokens +
                    estimateTokens(built.contextBlock) +
                    built.trimmedHistory.reduce((sum, m) => sum + estimateTokens(m.content), 0);

                  console.log(
                    `[ai-execute] attempt=${i} src=${resolved.source} level=${att.level} model=${att.modelId} ` +
                      `est_tokens=${promptTokens} budget=${att.budget} files_included=${built.filesIncluded} slim=${useSlim}`,
                  );

                  if (promptTokens > att.budget && i < attempts.length - 1) {
                    console.log(
                      `[ai-execute] skipping attempt ${i}: over budget, compressing further`,
                    );
                    continue;
                  }

                  // Pick the right SDK model handle for this attempt.
                  // - First attempt always uses the user-resolved gateway
                  //   (their API key / chosen provider).
                  // - Later groq-only fallback attempts use the built-in
                  //   Groq gateway with the larger model.
                  const model = att.useResolved
                    ? resolved.model
                    : gateway
                      ? gateway(att.modelId)
                      : resolved.model;
                  // Build the user turn. When the user attaches screenshots
                  // (vision), send the message as a multi-part content array
                  // so vision-capable models (Gemini 2.5+/3, GPT-5) can see
                  // them and reason about what's broken / what to build.
                  type Part = { type: "text"; text: string } | { type: "image"; image: string };
                  const userContent: string | Part[] =
                    visionImages.length > 0
                      ? [
                          { type: "text", text: built.contextBlock } as Part,
                          ...visionImages.map((image): Part => ({ type: "image", image })),
                        ]
                      : built.contextBlock;
                  const messages = [
                    ...built.trimmedHistory,
                    { role: "user" as const, content: userContent as any },
                  ];

                  rawText = "";
                  try {
                    const systemWithRules =
                      (projectRules
                        ? `${baseSystem}\n\n=== PROJECT-SPECIFIC RULES (override defaults) ===\n${projectRules}`
                        : baseSystem) +
                      "\n\nUse PROJECT MEMORY for persistent preferences, game name, style, genre, and recent context. If it conflicts with live project files or the latest user request, obey the latest request and live state." +
                      (modeAddendum ? `\n\n${modeAddendum}` : "");
                    const { generateTextWithToolFallback, extractToolActivity } =
                      await import("@/lib/ai-retry.server");
                    // Per-model output-token cap. Each provider/model family has a
                    // hard max_completion_tokens. Asking for more than the cap
                    // either errors (Groq 400) or is silently clamped. Asking for
                    // too little truncates large builds (the "ran out of room"
                    // error). Map known models to their real ceilings, then pick
                    // a generous but safe target inside that cap.
                    // Per-attempt wall-clock cap. Cloudflare workers will 502 if a
                    // single request hangs. UI/system builds (shop, inventory, menu,
                    // settings, tycoon, simulator) need more room than simple part edits.
                    // On retry (i>0) we drop tools entirely so the model just emits JSON —
                    // dramatically faster and avoids another timeout.
                    const heavyBuild =
                      /\b(shop|inventory|menu|settings|tycoon|simulator|gui|ui|system|leaderboard|quest|admin|hud|panel|dashboard)\b/i.test(
                        prompt,
                      );
                    const isRetry = i > 0;
                    // Give build JSON enough room to finish. The previous 3.5k cap
                    // was truncating maps/UI/system builds and producing empty results.
                    const attemptProvider = att.useResolved ? resolved.provider : "groq";
                    const attemptSource = att.useResolved ? resolved.source : "mcp";
                    const profile = getModelProfile(attemptProvider, att.modelId, {
                      thinking: !!thinking,
                      heavyBuild,
                      retry: isRetry,
                    });
                    const maxOut = profile.maxOutputTokens;
                    const perAttemptMs = isRetry
                      ? Math.min(profile.timeoutMs, 30_000)
                      : profile.timeoutMs;
                    const attemptCtl = new AbortController();
                    const timeoutId = setTimeout(() => attemptCtl.abort(), perAttemptMs);
                    const combinedSignal: AbortSignal = (AbortSignal as any).any
                      ? (AbortSignal as any).any([request.signal, attemptCtl.signal])
                      : attemptCtl.signal;
                    // Drop tools on retry attempts — they're the main source of latency
                    // and the model already has enough context to emit a JSON build directly.
                    const attemptTools = profile.supportsTools
                      ? (pickFastTools(prompt, { projectId, userId }) as any)
                      : {};
                    let textRes: any;
                    const started = Date.now();
                    try {
                      textRes = await withRateLimitRetry("ai-execute", () =>
                        generateTextWithToolFallback(
                          generateText,
                          {
                            model,
                            system: systemWithRules,
                            messages,
                            tools: attemptTools,
                            // Fewer tool-loop steps = faster builds. Most builds need 2-3 steps.
                            stopWhen: stepCountIs(profile.stopSteps),
                            maxOutputTokens: maxOut,
                            maxRetries: 0,
                            timeout: {
                              totalMs: perAttemptMs,
                              stepMs: perAttemptMs,
                              chunkMs: 25_000,
                            },
                            abortSignal: combinedSignal,
                          },
                          `ai-execute attempt#${i} src=${resolved.source} model=${att.modelId} slim=${useSlim} maxOut=${maxOut} tools=${isRetry ? 0 : "fast"}`,
                        ),
                      );
                      await recordProviderHealth({
                        feature: "build",
                        provider: attemptProvider,
                        model: att.modelId,
                        source: attemptSource,
                        ok: true,
                        durationMs: Date.now() - started,
                        projectId,
                        userId,
                      });
                    } finally {
                      clearTimeout(timeoutId);
                    }
                    rawText = textRes.text;
                    // Capture tool calls so the UI can show the user what the AI did.
                    try {
                      const events = extractToolActivity(textRes);
                      aiActivity = events.map((e) => {
                        const a = (e.args ?? {}) as Record<string, unknown>;
                        const s = (k: string) => (typeof a[k] === "string" ? (a[k] as string) : "");
                        let summary = "";
                        if (e.tool === "roblox_asset_search")
                          summary = `searched toolbox "${s("query")}" (${s("category") || "Models"})`;
                        else if (e.tool === "roblox_asset_info")
                          summary = `checked asset ${s("assetId")}`;
                        else if (e.tool === "roblox_asset_thumbnail")
                          summary = `previewed asset ${s("assetId")}`;
                        else if (e.tool === "roblox_docs_search")
                          summary = `checked Roblox docs for "${s("query")}"`;
                        else if (e.tool === "web_search") summary = `web search "${s("query")}"`;
                        else if (e.tool === "fetch_url") summary = `fetched ${s("url")}`;
                        else if (e.tool === "list_project_files")
                          summary = `listed your project files`;
                        else if (e.tool === "read_project_file") summary = `read ${s("path")}`;
                        else if (e.tool === "read_workspace_context")
                          summary = `inspected your live Studio workspace`;
                        else if (e.tool === "roblox_terrain_preset")
                          summary = `loaded terrain preset "${s("preset")}"`;
                        else if (e.tool === "add_mcp_server")
                          summary = `added MCP server ${s("name") || s("url")}`;
                        else if (e.tool === "update_mcp_server") summary = `updated MCP server`;
                        else if (e.tool === "list_mcp_servers") summary = `listed your MCP servers`;
                        else summary = e.tool;
                        return { tool: e.tool, summary, ok: e.ok };
                      });
                      if (aiActivity.length) {
                        console.log(`[ai-execute] tool activity: ${aiActivity.length} call(s)`);
                      }
                    } catch (actErr) {
                      console.warn("[ai-execute] failed to extract tool activity:", actErr);
                    }
                    result = normalizeResult(tryParseJSON(rawText));
                    lastErr = null;
                    break;
                  } catch (err: any) {
                    const attemptProvider = att.useResolved ? resolved.provider : "groq";
                    const attemptSource = att.useResolved ? resolved.source : "mcp";
                    await recordProviderHealth({
                      feature: "build",
                      provider: attemptProvider,
                      model: att.modelId,
                      source: attemptSource,
                      ok: false,
                      errorKind: classifyProviderError(err),
                      projectId,
                      userId,
                    });
                    lastErr = err;
                    const msg = String(err?.message ?? err);
                    const isTooLarge = /too large|context length|token|tpm|413/i.test(msg);
                    const isAbort =
                      err?.name === "AbortError" || /aborted|abort|timeout/i.test(msg);
                    const isBadJson =
                      /json|no json object|unexpected end|unterminated|truncated/i.test(msg);
                    console.error(
                      `[ai-execute] attempt ${i} failed (tooLarge=${isTooLarge}, abort=${isAbort}, badJson=${isBadJson}): ${msg.slice(0, 300)}`,
                    );
                    if (!isTooLarge && !isAbort && rawText && gateway) {
                      try {
                        result = normalizeResult(
                          await repairJsonWithGroq(
                            rawText,
                            gateway,
                            gateway(BLOXSMITH_LARGE_MODEL),
                          ),
                        );
                        lastErr = null;
                        break;
                      } catch {
                        // fall through
                      }
                    }
                    // Retry on token-size errors AND on aborts/timeouts — a 2nd
                    // attempt with a smaller context and slim prompt usually fits
                    // inside the wall-clock budget. Other errors (network, JSON
                    // parse, model 500) don't benefit from a retry.
                    if ((isTooLarge || isAbort || isBadJson) && i < attempts.length - 1) continue;
                    // Friendlier final message for aborts so the user knows to retry.
                    if (isAbort) {
                      lastErr = new Error(
                        "The AI took too long to finish this build in one shot. Try a shorter, more focused request (e.g. 'shop UI only — open/close button and 3 items') or run it again.",
                      );
                    } else if (isBadJson) {
                      result = getFocusedFallbackTemplate(prompt);
                      lastErr = null;
                    }
                    break;
                  }
                }

                if (!result && lastErr) throw lastErr;
              } catch (outerErr: any) {
                console.error("AI client initialisation/generation failed:", outerErr);
                const msg = String(outerErr?.message ?? outerErr);
                const isTimeout = /took too long|aborted|abort|timeout|timed out/i.test(msg);
                if (isTimeout) {
                  await refundOnFailure("ai generation timeout fallback");
                  result = getFocusedFallbackTemplate(prompt);
                } else if (/too large|context length|tpm/i.test(msg)) {
                  await refundOnFailure("ai generation failed");
                  throw new Error(
                    "Your project context is too large for this model even after the AI compressed it down to just your prompt. Try a shorter, more focused request (e.g. 'add a jump pad' instead of 'build the whole game'), or split the build into smaller steps.",
                  );
                } else {
                  await refundOnFailure("ai generation failed");
                  if (msg.includes("429")) throw new Error("AI rate limit. Try again in a moment.");
                  if (msg.includes("402"))
                    throw new Error("AI credits exhausted. Add credits in workspace settings.");
                  throw new Error("AI generation failed: " + msg);
                }
              }
            }
          }

          if (!result) {
            await refundOnFailure("ai generation returned no result");
            throw new Error("AI did not return a usable result.");
          }

          if (isEmptyBuildResult(result) && isLikelyBuildPrompt(prompt)) {
            console.warn("[ai-execute] empty build result; using focused fallback template");
            result = getFocusedFallbackTemplate(prompt);
          }

          result.files = result.files ?? [];
          result.actions = result.actions ?? [];

          // Convert create_script actions, etc. into files in result.files
          for (const a of result.actions) {
            const type = a.type || a.action_type;
            if (
              type === "create_script" ||
              type === "create_local_script" ||
              type === "create_module_script"
            ) {
              const fileType =
                type === "create_local_script"
                  ? "LocalScript"
                  : type === "create_module_script"
                    ? "ModuleScript"
                    : "Script";
              const folder = a.parent || "ServerScriptService";
              const name = a.name || "Script";
              const path = folder + "/" + name;
              const exists = result.files.some((f) => f.path === path);
              if (!exists) {
                result.files.push({
                  path,
                  file_type: fileType as any,
                  service_location: folder,
                  content: a.source || a.content || "",
                });
              }
            }
          }

          // Map actions to the plugin structure
          let mappedActions = mapGroqActionsToPlugin(result.actions);

          // Resolve any asset search queries asynchronously server-side
          mappedActions = await resolveSearchQueries(mappedActions);

          // Safety net: if the user asked for a map/world/lobby and the AI
          // didn't queue ANY toolbox insert, auto-search and inject one so
          // the result isn't just empty Lighting tweaks.
          const lowerPrompt = prompt.toLowerCase();
          const wantsMap =
            /\b(map|world|lobby|arena|city|town|village|island|dungeon|level|scene|environment)\b/.test(
              lowerPrompt,
            );
          const hasInsert = mappedActions.some(
            (a: any) => a?.type === "insert_toolbox_asset" || a?.type === "insertAsset",
          );
          if (wantsMap) {
            const hasSpawn = mappedActions.some(
              (a: any) =>
                a?.type === "spawn" || (a?.type === "create" && a?.className === "SpawnLocation"),
            );
            const mapFolders = ["Map", "Buildings", "Roads", "Trees", "Props", "Zones"].map(
              (name) => ({
                type: "create",
                className: "Folder",
                name,
                parent: name === "Map" ? "Workspace" : "Workspace/Map",
              }),
            );
            mappedActions.unshift(...mapFolders);
            if (!hasSpawn) {
              mappedActions.push({
                type: "spawn",
                name: "BloxsmithSpawn",
                parent: "Workspace/Map",
                position: { __t: "Vector3", x: 0, y: 6, z: 0 },
              });
            }
          }
          if (wantsMap && !hasInsert) {
            try {
              const { searchRobloxAssets } = await import("@/lib/ai-tools.server");
              // Build a focused query from the prompt (first 6 words).
              const q =
                prompt
                  .replace(/[^a-zA-Z0-9 ]/g, " ")
                  .split(/\s+/)
                  .filter(Boolean)
                  .slice(0, 6)
                  .join(" ") + " map";
              const items = await searchRobloxAssets(q, "Models", 3, {
                freeOnly: true,
                verifiedOnly: false,
              });
              if (items.length > 0) {
                console.log(
                  `[Execute API] Safety net: injected toolbox map ${items[0].assetId} ("${items[0].name}") for query "${q}"`,
                );
                mappedActions.push({
                  type: "insert_toolbox_asset",
                  assetId: items[0].assetId,
                  name: items[0].name || "ToolboxMap",
                  parent: "Workspace/Map",
                  position: [0, 0, 0],
                  scanScripts: true,
                  removeUnsafeScripts: true,
                  removeScriptsFromDecorativeAssets: true,
                  freeOnly: true,
                  requiresApprovalIfScriptsFound: true,
                } as any);
              }
            } catch (err) {
              console.error("Safety net toolbox search failed:", err);
            }
          }

          // Validation check
          const { data: existingForValidation } = await supabaseUser
            .from("project_files")
            .select("path")
            .eq("project_id", projectId);

          const validation = validateGenerated(
            result.files as any,
            mappedActions as any,
            (existingForValidation ?? []) as any,
          );

          // Update result with validated subsets
          result.files = validation.files as any;
          const validatedActions = validation.actions as any;

          // Build final action queue.
          // IMPORTANT: run create/structure actions FIRST so containers like
          // ScreenGui/Tool/Folder exist before scripts get parented into them.
          // Otherwise the plugin's script handler auto-creates a plain Folder
          // at that path (e.g. StarterGui/LoadingScreen becomes a Folder, not
          // a ScreenGui), and the LoadingScreen never renders in-game.
          const queued: GenAction[] = [];
          for (const a of validatedActions) {
            queued.push(a);
          }
          for (const f of result.files) {
            const segments = f.path.split("/");
            const name = segments[segments.length - 1];
            queued.push({
              type: "script",
              parent: f.service_location,
              name,
              className: f.file_type,
              source: f.content,
            });
          }

          // Detect dangerous actions
          const dangers = detectDangerousActions(result.files, queued);
          const hasDangers = dangers.length > 0;

          // If autoExecute is true AND there are no dangerous actions, we execute immediately
          const shouldAuto = autoExecute && !hasDangers;

          // Save generation
          const { data: genRow, error: genErr } = await supabaseUser
            .from("generations")
            .insert({
              user_id: userId,
              project_id: projectId,
              prompt,
              status: shouldAuto ? "success" : "pending",
              credits_used: charged.current ? cost : 0,
              result: { ...result, _queued: queued } as any,
            })
            .select("id")
            .single();
          if (genErr || !genRow) {
            throw new Error("I generated the build, but could not save the generation preview.");
          }

          const generationId = genRow?.id;

          if (shouldAuto) {
            // Persist files into project_files
            for (const f of result.files) {
              const { data: existing, error: lookupErr } = await supabaseUser
                .from("project_files")
                .select("id")
                .eq("project_id", projectId)
                .eq("path", f.path)
                .maybeSingle();
              if (lookupErr) {
                throw new Error(`Could not check existing project file ${f.path}.`);
              }

              if (existing) {
                const { error: updateErr } = await supabaseUser
                  .from("project_files")
                  .update({
                    content: f.content,
                    file_type: f.file_type,
                    service_location: f.service_location,
                    updated_at: new Date().toISOString(),
                  })
                  .eq("id", existing.id);
                if (updateErr) {
                  throw new Error(`Could not update project file ${f.path}.`);
                }
              } else {
                const { error: insertErr } = await supabaseUser.from("project_files").insert({
                  project_id: projectId,
                  path: f.path,
                  file_type: f.file_type,
                  service_location: f.service_location,
                  content: f.content,
                });
                if (insertErr) {
                  throw new Error(`Could not save project file ${f.path}.`);
                }
              }
            }

            // Queue actions to plugin_actions
            if (queued.length > 0) {
              const rows = queued.map((a) => ({
                project_id: projectId,
                user_id: userId,
                action_type: a.type,
                payload: { ...a, generation_id: generationId },
                status: "pending",
              }));
              const CHUNK = 50;
              for (let i = 0; i < rows.length; i += CHUNK) {
                const { error: insertErr } = await supabaseUser
                  .from("plugin_actions")
                  .insert(rows.slice(i, i + CHUNK));
                if (insertErr) {
                  throw new Error(
                    "I could not queue this for Studio because the plugin action permissions are not configured.",
                  );
                }
              }
            }
          }

          await rememberProjectInteraction(supabaseUser, {
            projectId,
            userId,
            prompt,
            result: { message: result.message, files: result.files, actions: queued },
          });

          const { scoreGeneration } = await import("@/lib/ai-quality");
          const quality = scoreGeneration(result.files as any, queued as any);

          return new Response(
            JSON.stringify({
              generationId,
              message: studioSafeMessage(result.message, queued.length, shouldAuto),
              files: result.files,
              actions: queued,
              status: shouldAuto ? "executing" : "preview",
              dangers: dangers,
              validation: {
                summary: validation.summary,
                errors: validation.errors,
                warnings: validation.warnings,
              },
              quality,
              aiMode: typeof aiMode === "string" ? aiMode : null,
              queuedCount: queued.length,
              aiActivity,
            }),
            { headers: corsHeaders },
          );
        } catch (e: any) {
          if (refundOnFailure) await refundOnFailure("assistant execute failed");
          console.error("API error in assistant/execute:", e);
          return new Response(JSON.stringify({ error: e.message || "Internal server error" }), {
            status: 500,
            headers: corsHeaders,
          });
        }
      },
    },
  },
});
