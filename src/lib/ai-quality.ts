// Heuristic quality + security scorer for AI-generated Roblox builds.
// Pure function — no AI call, no network. Runs server-side after generation.

export type QualityScore = {
  overall: number; // 0–100
  security: { level: "safe" | "review" | "risky"; score: number; findings: string[] };
  placement: { score: number; issues: string[] };
  mobile: { friendly: boolean; notes: string[] };
  datastore: { ready: boolean; notes: string[] };
  exploit: { risk: "low" | "medium" | "high"; reasons: string[] };
  testing: { needed: boolean; suggestions: string[] };
};

type GenFile = {
  path: string;
  file_type: string; // "Script" | "LocalScript" | "ModuleScript"
  service_location: string;
  content: string;
};
type GenAction = { type: string; [k: string]: unknown };

const SERVER_ONLY_SERVICES = new Set(["ServerScriptService", "ServerStorage"]);
const CLIENT_SERVICES = new Set([
  "StarterPlayerScripts",
  "StarterCharacterScripts",
  "StarterGui",
  "StarterPack",
]);

const CURRENCY_WORDS =
  /\b(coin|coins|cash|gem|gems|money|gold|points|exp|xp|level|inventory|reward|grant)\b/i;
const DAMAGE_WORDS = /\b(takedamage|:takedamage|humanoid\.health|damage\b|kill\b)\b/i;
const REMOTE_FIRE = /:FireServer\(/;
const REMOTE_HANDLER = /\.OnServerEvent\b|\.OnServerInvoke\b/;
const DATASTORE_USE = /DataStoreService|GetDataStore|:SetAsync|:UpdateAsync/;
const DATASTORE_LOOP =
  /(while\s+true|RunService\.(Heartbeat|RenderStepped|Stepped):Connect)[\s\S]{0,200}:SetAsync/;
const ADMIN_CMD = /\b(admin|kick|ban|teleport|setwalkspeed|givecoins|giveitem)\b/i;
const ADMIN_ALLOWLIST =
  /(UserId\s*==|table\.find\([^,]+,\s*\w+\.UserId\)|has_role|IsInGroup|GroupService)/;
const COOLDOWN = /(tick\(\)|os\.clock\(\)|os\.time\(\)|debounce|cooldown)/i;
const BACKDOOR_CODE =
  /\brequire\s*\(\s*\d{5,}\s*\)|\bloadstring\s*\(|\bgetfenv\s*\(|\bsetfenv\s*\(|\bInsertService\s*:\s*LoadAsset\s*\(\s*\d{5,}\s*\)/i;

const MOBILE_UDIM_OFFSET = /UDim2\.new\(\s*0\s*,\s*\d{2,}/; // hardcoded large pixel offset
const MOBILE_TEXTBUTTON = /TextButton|ImageButton|ScreenGui/;

function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(n)));
}

export function scoreGeneration(files: GenFile[], actions: GenAction[]): QualityScore {
  const securityFindings: string[] = [];
  const placementIssues: string[] = [];
  const mobileNotes: string[] = [];
  const datastoreNotes: string[] = [];
  const exploitReasons: string[] = [];
  const testingSuggestions: string[] = [];

  let securityScore = 100;
  let placementScore = 100;
  let mobileFriendly = true;
  let datastoreReady = true;
  let exploitRisk: "low" | "medium" | "high" = "low";

  const allCode = files.map((f) => f.content || "").join("\n");
  const hasAnyRemote =
    REMOTE_FIRE.test(allCode) ||
    REMOTE_HANDLER.test(allCode) ||
    actions.some(
      (a) =>
        a.type === "create" && /Remote/.test(String((a as { className?: string }).className ?? "")),
    );
  const hasAnyUi =
    actions.some((a) =>
      /ScreenGui|Frame|TextButton|ImageButton/.test(
        String((a as { className?: string }).className ?? ""),
      ),
    ) || /ScreenGui|TextButton|ImageButton/.test(allCode);
  const hasDataStore = DATASTORE_USE.test(allCode);

  for (const f of files) {
    const isLocal = f.file_type === "LocalScript";
    const isServer = f.file_type === "Script";
    const inServerService = SERVER_ONLY_SERVICES.has(f.service_location);
    const inClientService = CLIENT_SERVICES.has(f.service_location);

    // Placement checks
    if (isServer && inClientService) {
      placementIssues.push(
        `${f.path}: Server Script placed in ${f.service_location} (use ServerScriptService).`,
      );
      placementScore -= 20;
    }
    if (isLocal && inServerService) {
      placementIssues.push(`${f.path}: LocalScript placed in ${f.service_location} — won't run.`);
      placementScore -= 25;
    }

    // Security — LocalScript granting currency / damage
    if (BACKDOOR_CODE.test(f.content)) {
      securityFindings.push(
        `${f.path}: Suspicious code execution / marketplace require pattern detected.`,
      );
      securityScore -= 60;
      exploitRisk = "high";
      exploitReasons.push("Potential backdoor code pattern");
    }

    if (isLocal && CURRENCY_WORDS.test(f.content) && /\+=|=\s*\w+\s*\+/.test(f.content)) {
      securityFindings.push(
        `${f.path}: LocalScript appears to modify currency/inventory client-side.`,
      );
      securityScore -= 35;
      exploitReasons.push("Client-side currency mutation");
      exploitRisk = "high";
    }
    if (isLocal && DAMAGE_WORDS.test(f.content) && /:TakeDamage|Humanoid\.Health/.test(f.content)) {
      securityFindings.push(`${f.path}: LocalScript applying damage — easily exploited.`);
      securityScore -= 25;
      if (exploitRisk !== "high") exploitRisk = "medium";
      exploitReasons.push("Client-side damage application");
    }

    // Security — RemoteEvent fired from client with raw amount
    const fireMatches = f.content.match(/:FireServer\(([^)]*)\)/g) ?? [];
    for (const m of fireMatches) {
      if (/\b(amount|count|coins|cash|gold|gems|price|qty)\b/i.test(m)) {
        securityFindings.push(
          `${f.path}: Client passes amount/price into FireServer — must re-validate server-side.`,
        );
        securityScore -= 15;
        if (exploitRisk === "low") exploitRisk = "medium";
        exploitReasons.push("Client supplies a numeric value to a RemoteEvent");
      }
    }

    // Security — OnServerEvent handler with no validation / no cooldown
    if (isServer && REMOTE_HANDLER.test(f.content)) {
      const handlerBlock = f.content;
      const validates =
        /typeof\(|type\(\s*\w+\s*\)\s*==|math\.clamp|math\.min|math\.max|assert\(|if\s+not\s+\w+\s+then|if\s+\w+\s*<=?\s*0/.test(
          handlerBlock,
        );
      if (!validates) {
        securityFindings.push(`${f.path}: RemoteEvent handler with no type/range check on inputs.`);
        securityScore -= 20;
        exploitReasons.push("Unvalidated RemoteEvent payload");
        if (exploitRisk === "low") exploitRisk = "medium";
      }
      if (!COOLDOWN.test(handlerBlock)) {
        securityFindings.push(
          `${f.path}: RemoteEvent handler has no debounce/cooldown — spammable.`,
        );
        securityScore -= 10;
      }
    }

    // DataStore checks
    if (DATASTORE_USE.test(f.content)) {
      if (isLocal) {
        securityFindings.push(
          `${f.path}: DataStoreService used in a LocalScript — only works server-side.`,
        );
        securityScore -= 30;
        datastoreReady = false;
        datastoreNotes.push("DataStore used from LocalScript");
      }
      if (DATASTORE_LOOP.test(f.content)) {
        datastoreNotes.push(
          `${f.path}: DataStore write inside a tight loop — will hit rate limits.`,
        );
        datastoreReady = false;
      }
      if (!/pcall\s*\(/.test(f.content)) {
        datastoreNotes.push(
          `${f.path}: DataStore call without pcall — will crash on transient failure.`,
        );
        if (datastoreReady) datastoreReady = false;
      }
    }

    // Admin commands without allowlist
    if (isServer && ADMIN_CMD.test(f.content) && !ADMIN_ALLOWLIST.test(f.content)) {
      securityFindings.push(`${f.path}: Admin-like commands without a UserId/role check.`);
      securityScore -= 25;
      exploitReasons.push("Admin commands not permission-checked");
      exploitRisk = "high";
    }

    // Mobile friendliness for UI scripts
    if (hasAnyUi && MOBILE_TEXTBUTTON.test(f.content)) {
      if (
        MOBILE_UDIM_OFFSET.test(f.content) &&
        !/UDim2\.fromScale|UIAspectRatioConstraint|UISizeConstraint/.test(f.content)
      ) {
        mobileFriendly = false;
        mobileNotes.push(
          `${f.path}: Hardcoded pixel offsets, no scale or aspect constraint — won't fit mobile.`,
        );
      }
    }
  }

  // Project-level checks
  if (
    hasAnyRemote &&
    !files.some((f) => f.file_type === "Script" && REMOTE_HANDLER.test(f.content))
  ) {
    securityFindings.push("RemoteEvents exist but no server-side handler validates them.");
    securityScore -= 15;
    if (exploitRisk === "low") exploitRisk = "medium";
  }
  if (hasDataStore && !datastoreReady) {
    // already noted
  } else if (hasDataStore) {
    datastoreNotes.push("DataStore writes look safe (pcall, server-side).");
  }
  if (hasAnyUi && mobileFriendly && !/UIAspectRatioConstraint|UDim2\.fromScale/.test(allCode)) {
    mobileNotes.push("UI works on desktop, but consider UIAspectRatioConstraint for mobile.");
  }

  // Testing suggestions
  if (files.length > 0)
    testingSuggestions.push("Press Play in Studio and exercise the new system once.");
  if (hasAnyRemote)
    testingSuggestions.push("Open a 2-player local server and verify RemoteEvents fire correctly.");
  if (hasDataStore) testingSuggestions.push("Test save/load by rejoining the server.");
  if (hasAnyUi) testingSuggestions.push("Test the UI on a mobile/tablet emulator in Studio.");

  const security = securityScore >= 85 ? "safe" : securityScore >= 60 ? "review" : "risky";

  const overall = clamp(
    Math.round(
      securityScore * 0.5 +
        placementScore * 0.3 +
        (mobileFriendly ? 100 : 60) * 0.1 +
        (datastoreReady ? 100 : 60) * 0.1,
    ),
  );

  return {
    overall,
    security: {
      level: security,
      score: clamp(securityScore),
      findings: securityFindings.slice(0, 8),
    },
    placement: { score: clamp(placementScore), issues: placementIssues.slice(0, 6) },
    mobile: { friendly: mobileFriendly, notes: mobileNotes.slice(0, 4) },
    datastore: { ready: datastoreReady, notes: datastoreNotes.slice(0, 4) },
    exploit: { risk: exploitRisk, reasons: Array.from(new Set(exploitReasons)).slice(0, 5) },
    testing: { needed: testingSuggestions.length > 0, suggestions: testingSuggestions.slice(0, 4) },
  };
}
