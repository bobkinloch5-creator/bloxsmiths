import { createFileRoute } from "@tanstack/react-router";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Content-Type": "application/json",
};

type GenFile = { path: string; file_type: string; service_location: string; content: string };
type GenAction = {
  type: string;
  parent?: string;
  name?: string;
  className?: string;
  properties?: Record<string, unknown>;
  [key: string]: unknown;
};

function cleanPrompt(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 4000) : "";
}

function scriptFile(path: string, service: string, content: string, fileType = "Script"): GenFile {
  return { path, file_type: fileType, service_location: service, content };
}

function luaString(value: string) {
  return JSON.stringify(value.slice(0, 500));
}

function featureName(prompt: string) {
  const words = prompt
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(
      (w) =>
        w.length > 2 &&
        !/^(make|create|add|build|the|for|with|and|this|that|roblox|game|please)$/i.test(w),
    )
    .slice(0, 4);
  const name = words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join("");
  return name || "CustomFeature";
}

function makeLeaderstatsScript(): GenFile {
  return scriptFile(
    "ServerScriptService/BloxSmith/Leaderstats.server.lua",
    "ServerScriptService",
    `local Players = game:GetService("Players")

Players.PlayerAdded:Connect(function(player)
    local leaderstats = Instance.new("Folder")
    leaderstats.Name = "leaderstats"
    leaderstats.Parent = player

    local cash = Instance.new("IntValue")
    cash.Name = "Cash"
    cash.Value = 0
    cash.Parent = leaderstats
end)
`,
  );
}

function makeTycoonControllerScript(): GenFile {
  return scriptFile(
    "ServerScriptService/BloxSmith/TycoonController.server.lua",
    "ServerScriptService",
    `local Players = game:GetService("Players")
local CollectionService = game:GetService("CollectionService")

local function getCash(player)
    local leaderstats = player:FindFirstChild("leaderstats")
    return leaderstats and leaderstats:FindFirstChild("Cash")
end

local function hookCollector(part)
    part.Touched:Connect(function(hit)
        local character = hit.Parent
        local player = character and Players:GetPlayerFromCharacter(character)
        if not player then return end
        local cash = getCash(player)
        if cash then cash.Value += 25 end
    end)
end

for _, part in ipairs(CollectionService:GetTagged("BloxSmithCollector")) do
    if part:IsA("BasePart") then hookCollector(part) end
end

CollectionService:GetInstanceAddedSignal("BloxSmithCollector"):Connect(function(part)
    if part:IsA("BasePart") then hookCollector(part) end
end)
`,
  );
}

function makeLoadingScreenScript(): GenFile {
  return scriptFile(
    "StarterGui/BloxSmithLoadingScreen/LoadingScreen.client.lua",
    "StarterGui",
    `local Players = game:GetService("Players")
local TweenService = game:GetService("TweenService")
local ReplicatedFirst = game:GetService("ReplicatedFirst")

ReplicatedFirst:RemoveDefaultLoadingScreen()
local playerGui = Players.LocalPlayer:WaitForChild("PlayerGui")

local gui = Instance.new("ScreenGui")
gui.Name = "BloxSmithLoadingScreen"
gui.IgnoreGuiInset = true
gui.ResetOnSpawn = false
gui.DisplayOrder = 999999
gui.Parent = playerGui

local background = Instance.new("Frame")
background.Size = UDim2.fromScale(1, 1)
background.BackgroundColor3 = Color3.fromRGB(5, 8, 18)
background.BorderSizePixel = 0
background.Parent = gui

local gradient = Instance.new("UIGradient")
gradient.Color = ColorSequence.new({ ColorSequenceKeypoint.new(0, Color3.fromRGB(15, 255, 175)), ColorSequenceKeypoint.new(1, Color3.fromRGB(255, 135, 20)) })
gradient.Rotation = 35
gradient.Parent = background

local card = Instance.new("Frame")
card.AnchorPoint = Vector2.new(0.5, 0.5)
card.Position = UDim2.fromScale(0.5, 0.5)
card.Size = UDim2.fromScale(0.72, 0.28)
card.BackgroundColor3 = Color3.fromRGB(10, 18, 30)
card.BackgroundTransparency = 0.1
card.BorderSizePixel = 0
card.Parent = background

local limit = Instance.new("UISizeConstraint")
limit.MinSize = Vector2.new(260, 170)
limit.MaxSize = Vector2.new(640, 260)
limit.Parent = card

local corner = Instance.new("UICorner")
corner.CornerRadius = UDim.new(0, 22)
corner.Parent = card

local title = Instance.new("TextLabel")
title.BackgroundTransparency = 1
title.Position = UDim2.fromScale(0.08, 0.16)
title.Size = UDim2.fromScale(0.84, 0.22)
title.Font = Enum.Font.GothamBold
title.Text = "Loading Your Roblox Adventure"
title.TextColor3 = Color3.fromRGB(255, 255, 255)
title.TextScaled = true
title.Parent = card

local status = Instance.new("TextLabel")
status.BackgroundTransparency = 1
status.Position = UDim2.fromScale(0.08, 0.44)
status.Size = UDim2.fromScale(0.84, 0.14)
status.Font = Enum.Font.GothamMedium
status.Text = "Preparing assets..."
status.TextColor3 = Color3.fromRGB(190, 220, 220)
status.TextScaled = true
status.Parent = card

local barBack = Instance.new("Frame")
barBack.Position = UDim2.fromScale(0.08, 0.68)
barBack.Size = UDim2.fromScale(0.84, 0.08)
barBack.BackgroundColor3 = Color3.fromRGB(25, 35, 48)
barBack.BorderSizePixel = 0
barBack.Parent = card
Instance.new("UICorner", barBack).CornerRadius = UDim.new(1, 0)

local bar = Instance.new("Frame")
bar.Size = UDim2.fromScale(0, 1)
bar.BackgroundColor3 = Color3.fromRGB(52, 255, 177)
bar.BorderSizePixel = 0
bar.Parent = barBack
Instance.new("UICorner", bar).CornerRadius = UDim.new(1, 0)

for i, text in ipairs({ "Preparing assets...", "Building your world...", "Loading scripts...", "Polishing UI...", "Almost ready..." }) do
    status.Text = text
    TweenService:Create(bar, TweenInfo.new(0.45, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), { Size = UDim2.fromScale(i / 5, 1) }):Play()
    task.wait(0.55)
end
TweenService:Create(background, TweenInfo.new(0.45), { BackgroundTransparency = 1 }):Play()
task.wait(0.5)
gui:Destroy()
`,
    "LocalScript",
  );
}

function makeUniversalServerScript(prompt: string, name: string): GenFile {
  return scriptFile(
    `ServerScriptService/BloxSmith/${name}.server.lua`,
    "ServerScriptService",
    `-- BloxSmith generated starter system
-- Request: ${prompt.replace(/\n/g, " ").slice(0, 180)}

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local featureName = ${luaString(name)}
local remotesFolder = ReplicatedStorage:FindFirstChild("BloxSmithRemotes") or Instance.new("Folder")
remotesFolder.Name = "BloxSmithRemotes"
remotesFolder.Parent = ReplicatedStorage

local remote = remotesFolder:FindFirstChild(featureName .. "Event") or Instance.new("RemoteEvent")
remote.Name = featureName .. "Event"
remote.Parent = remotesFolder

local cooldowns = {}
remote.OnServerEvent:Connect(function(player, action)
    if typeof(action) ~= "string" then return end
    local now = os.clock()
    if cooldowns[player] and now - cooldowns[player] < 0.75 then return end
    cooldowns[player] = now
    print("[BloxSmith]", player.Name, "used", featureName, action)
end)

Players.PlayerRemoving:Connect(function(player) cooldowns[player] = nil end)
print("[BloxSmith] Loaded generated feature:", featureName)
`,
  );
}

function makeUniversalGuiScript(prompt: string, name: string): GenFile {
  return scriptFile(
    `StarterGui/BloxSmith${name}/${name}.client.lua`,
    "StarterGui",
    `local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local gui = Instance.new("ScreenGui")
gui.Name = "BloxSmith${name}"
gui.ResetOnSpawn = false
gui.Parent = Players.LocalPlayer:WaitForChild("PlayerGui")

local panel = Instance.new("Frame")
panel.AnchorPoint = Vector2.new(0.5, 0.5)
panel.Position = UDim2.fromScale(0.5, 0.5)
panel.Size = UDim2.fromScale(0.42, 0.28)
panel.BackgroundColor3 = Color3.fromRGB(12, 20, 34)
panel.BorderSizePixel = 0
panel.Parent = gui

local limit = Instance.new("UISizeConstraint")
limit.MinSize = Vector2.new(260, 150)
limit.MaxSize = Vector2.new(520, 260)
limit.Parent = panel
Instance.new("UICorner", panel).CornerRadius = UDim.new(0, 18)

local title = Instance.new("TextLabel")
title.BackgroundTransparency = 1
title.Position = UDim2.fromScale(0.08, 0.12)
title.Size = UDim2.fromScale(0.84, 0.22)
title.Font = Enum.Font.GothamBold
title.Text = ${luaString(name.replace(/([A-Z])/g, " $1").trim())}
title.TextColor3 = Color3.fromRGB(255, 255, 255)
title.TextScaled = true
title.Parent = panel

local body = Instance.new("TextLabel")
body.BackgroundTransparency = 1
body.Position = UDim2.fromScale(0.08, 0.4)
body.Size = UDim2.fromScale(0.84, 0.18)
body.Font = Enum.Font.GothamMedium
body.Text = ${luaString(prompt)}
body.TextColor3 = Color3.fromRGB(190, 220, 220)
body.TextScaled = true
body.Parent = panel

local button = Instance.new("TextButton")
button.Position = UDim2.fromScale(0.24, 0.68)
button.Size = UDim2.fromScale(0.52, 0.18)
button.BackgroundColor3 = Color3.fromRGB(52, 255, 177)
button.TextColor3 = Color3.fromRGB(5, 8, 18)
button.Font = Enum.Font.GothamBold
button.TextScaled = true
button.Text = "Use"
button.Parent = panel
Instance.new("UICorner", button).CornerRadius = UDim.new(0, 12)

button.Activated:Connect(function()
    local remotes = ReplicatedStorage:FindFirstChild("BloxSmithRemotes")
    local remote = remotes and remotes:FindFirstChild(${luaString(name)} .. "Event")
    if remote then remote:FireServer("use") end
end)
`,
    "LocalScript",
  );
}

function loadingScreenActions(): GenAction[] {
  return [
    { type: "create_folder", parent: "StarterGui", name: "BloxSmithLoadingScreen" },
    {
      type: "script",
      parent: "StarterGui/BloxSmithLoadingScreen",
      name: "LoadingScreen.client.lua",
      className: "LocalScript",
      source: makeLoadingScreenScript().content,
    },
  ];
}

function universalActions(prompt: string, name: string): GenAction[] {
  const lower = prompt.toLowerCase();
  const actions: GenAction[] = [
    { type: "create_folder", parent: "Workspace", name: `BloxSmith${name}` },
    {
      type: "create_part",
      parent: `Workspace/BloxSmith${name}`,
      name: `${name}Base`,
      properties: { Size: [44, 2, 44], Position: [0, 1, 0], Color: [60, 180, 130], Anchored: true },
    },
    {
      type: "create_part",
      parent: `Workspace/BloxSmith${name}`,
      name: `${name}Display`,
      properties: { Size: [18, 10, 2], Position: [0, 7, -18], Color: [35, 45, 70], Anchored: true },
    },
  ];

  if (/shop|menu|ui|inventory|loading|screen|button|hud|main menu/.test(lower)) {
    actions.push({ type: "create_folder", parent: "StarterGui", name: `BloxSmith${name}` });
  }
  if (/npc|enemy|pet|dog|cat|monster|boss|zombie|character/.test(lower)) {
    actions.push({
      type: "create_part",
      parent: `Workspace/BloxSmith${name}`,
      name: `${name}Character`,
      properties: { Size: [4, 7, 3], Position: [10, 5, 0], Color: [255, 145, 55], Anchored: true },
    });
  }
  if (/portal|door|teleport|entry|gate/.test(lower)) {
    actions.push({
      type: "create_part",
      parent: `Workspace/BloxSmith${name}`,
      name: `${name}Portal`,
      properties: {
        Size: [8, 14, 2],
        Position: [-10, 8, 0],
        Color: [120, 90, 255],
        Transparency: 0.2,
        Anchored: true,
      },
    });
  }
  return actions;
}

function basicWorkspaceActions(prompt: string): GenAction[] {
  const lower = prompt.toLowerCase();
  const name = featureName(prompt);
  if (/loading|load screen|loading screen|splash screen|start screen/.test(lower))
    return loadingScreenActions();
  if (/tycoon|cash|dropper|conveyor|collector|owner/.test(lower)) {
    return [
      { type: "create_folder", parent: "Workspace", name: "BloxSmithTycoon" },
      {
        type: "create_part",
        parent: "Workspace/BloxSmithTycoon",
        name: "TycoonBase",
        properties: {
          Size: [90, 2, 90],
          Position: [0, 0, 0],
          Color: [60, 180, 90],
          Anchored: true,
        },
      },
      {
        type: "create_part",
        parent: "Workspace/BloxSmithTycoon",
        name: "Conveyor",
        properties: { Size: [8, 1, 45], Position: [0, 2, 0], Color: [35, 35, 45], Anchored: true },
      },
      {
        type: "create_part",
        parent: "Workspace/BloxSmithTycoon",
        name: "Collector",
        properties: {
          Size: [14, 2, 8],
          Position: [0, 3, 28],
          Color: [0, 255, 90],
          Anchored: true,
          Tags: ["BloxSmithCollector"],
        },
      },
      {
        type: "create_part",
        parent: "Workspace/BloxSmithTycoon",
        name: "BuyDropperButton",
        properties: {
          Size: [8, 1, 8],
          Position: [-18, 2, -18],
          Color: [255, 210, 0],
          Anchored: true,
        },
      },
    ];
  }
  if (/obby|checkpoint|stage/.test(lower)) {
    return [
      { type: "create_folder", parent: "Workspace", name: "BloxSmithObby" },
      {
        type: "create_part",
        parent: "Workspace/BloxSmithObby",
        name: "Start",
        properties: {
          Size: [18, 1, 18],
          Position: [0, 1, 0],
          Color: [0, 255, 100],
          Anchored: true,
        },
      },
      {
        type: "create_part",
        parent: "Workspace/BloxSmithObby",
        name: "Checkpoint1",
        properties: {
          Size: [14, 1, 14],
          Position: [0, 5, -35],
          Color: [0, 170, 255],
          Anchored: true,
        },
      },
      {
        type: "create_part",
        parent: "Workspace/BloxSmithObby",
        name: "Winner",
        properties: {
          Size: [20, 1, 20],
          Position: [0, 8, -70],
          Color: [255, 220, 0],
          Anchored: true,
        },
      },
    ];
  }
  if (/map|city|forest|lobby|world|horror|school|restaurant|simulator/.test(lower)) {
    return [
      { type: "create_folder", parent: "Workspace", name: "BloxSmithMap" },
      {
        type: "create_part",
        parent: "Workspace/BloxSmithMap",
        name: "MainGround",
        properties: {
          Size: [140, 2, 140],
          Position: [0, 0, 0],
          Color: [90, 170, 90],
          Anchored: true,
        },
      },
      {
        type: "create_part",
        parent: "Workspace/BloxSmithMap",
        name: "SpawnPlatform",
        properties: {
          Size: [20, 1, 20],
          Position: [0, 3, 0],
          Color: [0, 255, 180],
          Anchored: true,
        },
      },
      {
        type: "create_part",
        parent: "Workspace/BloxSmithMap",
        name: "FeatureBuilding",
        properties: {
          Size: [28, 24, 28],
          Position: [35, 13, 35],
          Color: [80, 90, 120],
          Anchored: true,
        },
      },
    ];
  }
  return universalActions(prompt, name);
}

function buildFallbackResult(prompt: string) {
  const lower = prompt.toLowerCase();
  const name = featureName(prompt);
  const files: GenFile[] = [];
  let message = `Prepared ${name} as a Studio-ready Roblox feature with workspace objects, server validation, remotes, and a mobile-friendly UI starter.`;

  if (/loading|load screen|loading screen|splash screen|start screen/.test(lower)) {
    files.push(makeLoadingScreenScript());
    message =
      "Prepared a premium Roblox loading screen with animated progress, gradient background, mobile-friendly scaling, and a LocalScript under StarterGui/BloxSmithLoadingScreen.";
  } else {
    files.push(makeUniversalServerScript(prompt, name));
    files.push(makeUniversalGuiScript(prompt, name));
  }

  if (/cash|leaderstats|tycoon|simulator|coin|money|shop|buy|sell|reward/.test(lower)) {
    files.push(makeLeaderstatsScript());
    message = `Prepared ${name} with currency/leaderstats support, server validation, UI, and Studio-ready objects.`;
  }
  if (/tycoon|collector|dropper|conveyor/.test(lower)) {
    files.push(makeTycoonControllerScript());
    message =
      "Prepared a starter tycoon system with a base, collector, conveyor, currency, UI, and server script.";
  }

  const actions = basicWorkspaceActions(prompt);
  return {
    message,
    files,
    actions,
    autoExecute: true,
    queuedCount: files.length + actions.length,
    chargedCredits: 0,
    model: "safe-universal-builder",
  };
}

export const Route = createFileRoute("/api/assistant/execute")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),
      POST: async ({ request }) => {
        try {
          const body = await request.json().catch(() => ({}));
          const prompt = cleanPrompt(body?.prompt ?? body?.message ?? body?.input);
          if (!prompt) {
            return new Response(
              JSON.stringify({
                error: "missing_prompt",
                message: "Please type what you want BloxSmith to build.",
              }),
              { status: 400, headers: corsHeaders },
            );
          }
          return new Response(JSON.stringify(buildFallbackResult(prompt)), {
            status: 200,
            headers: corsHeaders,
          });
        } catch (error: any) {
          console.error("assistant execute safe route failed", error?.message ?? error);
          return new Response(
            JSON.stringify({
              message:
                "BloxSmith recovered from an assistant error. Try again or refresh the project.",
              files: [],
              actions: [],
              queuedCount: 0,
              chargedCredits: 0,
              model: "safe-error-fallback",
            }),
            { status: 200, headers: corsHeaders },
          );
        }
      },
    },
  },
});
