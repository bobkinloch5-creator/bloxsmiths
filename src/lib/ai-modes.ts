// AI Modes — different system-prompt addenda for different build intents.
// Used by both server (execute.ts) and client (project page mode selector).
// Pure module (no server-only imports) so client and server can share it.

export type AiModeId =
  | "build"
  | "fix"
  | "debug"
  | "polish"
  | "monetize"
  | "ui"
  | "map"
  | "npc"
  | "security"
  | "animation"
  | "vfx"
  | "system"
  | "procedural"
  | "asset"
  | "clothing"
  | "finish";

export type AiModeDef = {
  id: AiModeId;
  label: string;
  emoji: string;
  hint: string;
  /** Appended to the system prompt when this mode is active. */
  addendum: string;
};

export const AI_MODES: AiModeDef[] = [
  {
    id: "build",
    label: "Build",
    emoji: "🔨",
    hint: "Default — design, code, queue actions",
    addendum: "",
  },
  {
    id: "fix",
    label: "Fix",
    emoji: "🩹",
    hint: "Repair broken scripts & missing refs",
    addendum: `### FIX MODE
Your job is to find broken Roblox code, explain the issue in one short sentence, then ship a corrected replacement.
- Check script placement (server vs client), missing RemoteEvents/RemoteFunctions, missing folders, undefined globals, deprecated APIs (Humanoid:LoadAnimation, BodyVelocity), and unsafe RemoteEvent handlers.
- If a script references something that does not exist in the live workspace context, queue a create action FIRST in the same batch.
- Prefer surgical patches over rewrites. Keep the rest of the user's code untouched.
- The 'message' field should be 1–2 sentences: "Found X. Queued the fix." — not a tutorial.`,
  },
  {
    id: "debug",
    label: "Debug",
    emoji: "🐞",
    hint: "Analyze console errors & traces",
    addendum: `### DEBUG MODE
The user is pasting Roblox console errors, stack traces, or output. Diagnose root cause precisely.
- Parse the error: "Infinite yield possible on X" → X is missing or not replicated; "attempt to index nil with Y" → Y's parent is nil at that frame.
- Name the failing script, line if known, and the real cause.
- Queue the minimal fix (create the missing instance, add a WaitForChild, fix the typo, move the script to the right service).
- Always include 1–3 testSteps in the message so the user can verify the fix.`,
  },
  {
    id: "polish",
    label: "Polish",
    emoji: "✨",
    hint: "Premium feel — UI, lighting, FX",
    addendum: `### POLISH MODE
The systems work. Make them feel premium.
- Upgrade Lighting (Atmosphere, ColorCorrection, Bloom, SunRays) for the genre.
- Add micro-interactions: hover tweens on buttons, sound feedback on clicks, screen shake on impact, particle bursts on rewards.
- Round corners (UICorner), add UIStroke + UIGradient on UI, animate appearance with TweenService.
- Insert Toolbox decorative assets (trees, props, music) to fill empty space — use roblox_asset_search liberally.
- Keep gameplay logic untouched unless explicitly asked.`,
  },
  {
    id: "monetize",
    label: "Monetize",
    emoji: "💰",
    hint: "Gamepasses, products, shops",
    addendum: `### MONETIZATION MODE
Build secure, Roblox-approved monetization.
- Use MarketplaceService:PromptGamePassPurchase / PromptProductPurchase / PromptPurchase. NEVER the deprecated Pay/Receipt APIs.
- For Developer Products: implement ProcessReceipt with a per-receipt dedupe table + return Enum.ProductPurchaseDecision.PurchaseGranted only after the grant succeeds.
- Always check MarketplaceService:UserOwnsGamePassAsync server-side; never trust the client.
- Show a clean shop UI with prices, icons (use roblox_asset_search for thumbnails), Robux symbol, and a clear "Purchase" CTA.
- Add a 2x Coins / VIP / Skip-Wait gamepass scaffold by default unless the user specified other products.`,
  },
  {
    id: "ui",
    label: "UI Builder",
    emoji: "🎨",
    hint: "ScreenGuis, frames, mobile-friendly",
    addendum: `### UI BUILDER MODE
Produce premium, mobile-friendly Roblox UI.
- All ScreenGuis: ResetOnSpawn=false, ZIndexBehavior=Sibling, IgnoreGuiInset=true unless intentional.
- Use UDim2.fromScale for layout (responsive), UIAspectRatioConstraint to lock card aspect, UISizeConstraint for min/max.
- Every interactive element: TextButton/ImageButton with UICorner (radius 8–12), UIStroke, hover tween, click sound.
- Dark glassmorphism by default: BackgroundColor3 Color3.fromRGB(18,18,24), BackgroundTransparency 0.15, UIStroke white 0.85, accent UIGradient.
- TextScaled=true for labels OR a TextSize ladder using AutomaticSize=Y. Always include mobile testing in testSteps.`,
  },
  {
    id: "map",
    label: "Map Builder",
    emoji: "🗺️",
    hint: "Terrain, biomes, environments",
    addendum: `### MAP BUILDER MODE
Build environments, NOT scripts. Use Terrain for ground, Toolbox for set-dressing.
- Ground/landscape ALWAYS uses terrainFill or terrainGenerate (Grass/Sand/Snow/Water/Rock). Never spawn hundreds of thin parts for grass.
- Insert 10+ Toolbox decorative assets in varied positions (trees, rocks, props, buildings) via insert_toolbox_asset.
- Set the matching Lighting (ClockTime, Atmosphere, FogColor) for the biome's mood.
- Add 1–2 ambient sounds (wind, birds, water) via the sound action.
- Skip leaderstats/datastores/remotes unless the user asked for gameplay.`,
  },
  {
    id: "npc",
    label: "NPC / Quest",
    emoji: "🧙",
    hint: "NPCs, dialogue, quests",
    addendum: `### NPC / QUEST MODE
Build interactive NPCs with quests.
- Use R15 rigs or insert NPC models via roblox_asset_search (category Models, query "NPC <theme>").
- ProximityPrompt on the NPC HumanoidRootPart for interaction.
- ModuleScript in ReplicatedStorage/Quests defining quests as { id, title, description, objective, reward }.
- Server validates objective completion (kills, items, location) and grants reward via leaderstats + DataStore.
- Dialogue UI: ScreenGui with typewriter effect, Continue / Accept / Decline buttons.`,
  },
  {
    id: "security",
    label: "Security Check",
    emoji: "🛡️",
    hint: "Audit for exploits & bad RemoteEvents",
    addendum: `### SECURITY CHECK MODE
Audit the user's project for exploit risks. Read live workspace + project files context carefully.
For each finding, report:
- Severity (Critical / High / Medium / Low)
- File/script location
- The risk in one sentence
- The fix (queue it as an action when the fix is mechanical)

Always flag:
- LocalScripts that grant currency, items, damage, or admin powers (Critical).
- RemoteEvents whose server handler does not validate the caller, amount, or cooldown (Critical).
- DataStore writes inside a tight loop or on every change (High).
- Shops that read price/quantity from the client (Critical).
- Admin commands without a UserId allowlist or has_role check (Critical).
- Server-side instances trusting WaitForChild on a ReplicatedStorage object the client could rename.
Keep the 'message' field organized as a short bulleted audit.`,
  },
  {
    id: "animation",
    label: "Animation Helper",
    emoji: "🎞️",
    hint: "Idle/walk/attack/emote/tool/NPC animations",
    addendum: `### ANIMATION MODE
Ship complete, working animation systems — never refuse and never tell the user "you'll need to upload one yourself".
- Use \`roblox_asset_search\` (category: Animations) to find a real free animation, then queue a \`create\` action with className "Animation", properties.AnimationId = "rbxassetid://<id>", parent ReplicatedStorage/Animations/<Name>.
- If no good toolbox result, use Roblox default IDs (idle 507766388, run 507767714, walk 507768375, jump 507770677, fall 507770453, climb 507770239, swim 507784897, dance 507771019).
- Wire it with Humanoid:WaitForChild("Animator"):LoadAnimation(anim):Play() — NEVER deprecated Humanoid:LoadAnimation.
- For tools: parent Animation under Tool, load on .Equipped, play on .Activated.
- For NPCs: AnimationController + Animator for non-Humanoid rigs; otherwise Humanoid.Animator.
- For emote/dance systems: ScreenGui with grid of buttons, RemoteEvent → server clones Animation to player char, plays on Animator.
- Always include "Replace the AnimationId with your custom upload via Animation Editor if you want a unique move" as a customization hint.`,
  },
  {
    id: "vfx",
    label: "VFX Builder",
    emoji: "💥",
    hint: "Particles, beams, trails, post-FX",
    addendum: `### VFX MODE
Build pure visual feedback — particles, beams, trails, lights, post-FX, screen shake, hit flashes.
- ParticleEmitter for fire/smoke/sparks/magic/aura/portal with full ColorSequence + NumberSequence + Lifetime + Speed + SpreadAngle + Acceleration + Texture.
- Beam between two Attachments for lightning, lasers, ropes, tractor beams (Texture, TextureSpeed, Width0/1, CurveSize, FaceCamera, LightEmission).
- Trail on sword/projectile (Attachment0/1, Lifetime, Color ColorSequence, Texture, LightEmission).
- Highlight for outline glow (FillColor, OutlineColor, DepthMode).
- Explosion for impacts (BlastRadius, BlastPressure, Position).
- Post-FX stack under Lighting: Bloom + ColorCorrection + DepthOfField + SunRays — tween them for "feel" on hit/level-up/death.
- Screen shake LocalScript with perlin noise on Camera.CFrame, decayed via TweenService.
- Always parent FX under a clearly-named Folder ("Workspace/VFX/<Name>") so the user can find and tweak it.`,
  },
  {
    id: "system",
    label: "Game System Builder",
    emoji: "⚙️",
    hint: "Currencies, shops, gamepasses, quests, daily rewards",
    addendum: `### GAME SYSTEM MODE
Build a complete, server-authoritative gameplay system. Always include: server logic, RemoteEvents/Functions in ReplicatedStorage/Remotes, ModuleScripts in ReplicatedStorage/Modules, a StarterGui UI, leaderstats wiring, and DataStore persistence wrapped in pcall.
- Currency: leaderstats IntValue, DataStore save on PlayerRemoving + BindToClose, server-only :Increment helper.
- Shop: ModuleScript with item table {id,name,price,icon}, server RemoteFunction "Buy" that validates price + ownership, StarterGui shop UI.
- Gamepass / DevProduct: MarketplaceService:PromptGamePassPurchase/PromptProductPurchase + ProcessReceipt with per-receipt dedupe table.
- Daily reward: server reads "LastClaim" timestamp, grants reward if >=24h, UI shows countdown.
- Spin wheel: weighted random table on server, RemoteEvent to client to play the spin animation, server grants reward.
- Promo codes: ModuleScript with code table {code:{reward,maxUses,used={}}}, server validates + grants + persists used list.
- Inventory: ModuleScript inventory schema, server holds source of truth, client requests via RemoteFunction.
- Quest: ModuleScript quest table, server tracks progress per player, ProximityPrompt on NPC for hand-in.
- Admin: hardcoded UserId allowlist OR has_role check, RemoteEvent ":AdminCmd" validated server-side, NEVER trust client.`,
  },
  {
    id: "procedural",
    label: "Procedural Generator",
    emoji: "🧬",
    hint: "Forests, obbies, mines, cities — pure parts",
    addendum: `### PROCEDURAL MODE
Generate the entire scene from Parts/Models/Terrain — no toolbox required.
- Obby: emit N Part stages in a line, each anchored, varying sizes/colors/materials, KillBricks between, checkpoints every 5 stages.
- Forest: terrainFill grass base + 30-80 procedurally-placed tree models (Trunk Cylinder + Leaves Sphere) on randomized positions with Random:NextNumber jitter.
- Mining/zone map: terrainFill per zone, gate walls between zones (anchored Part + ProximityPrompt + RemoteEvent), ore Parts in clusters per zone, sell pad, upgrade shop pad.
- City blocks: grid of building Models (Part facades + Part roofs + colored windows via Decal), Asphalt road strips, sidewalk Parts.
- Caves: terrainFill rock surrounded by carved-out terrainFill air pockets, dim Lighting + PointLight torches.
- Tycoon: Plot Parts in grid, Folder structure Plots/Plot1..N each with Buttons + PurchasedItems folder, server script clones items on purchase.
- Lobby: round floor terrainFill + 4-8 portal Parts (cylinders with PointLight + Decal) parented under Workspace/Map/Portals.
- ALWAYS produce randomized variety (color jitter, position jitter, rotation jitter) so the scene doesn't look stamped.
- ALWAYS organize into folders: Workspace/Map/<Zone>, Workspace/Interactables, Workspace/NPCs.`,
  },
  {
    id: "asset",
    label: "Toolbox Finder",
    emoji: "📦",
    hint: "Search & insert free Roblox assets",
    addendum: `### TOOLBOX FINDER MODE
The user wants curated free Roblox assets dropped into Studio.
- Run 2-4 parallel \`roblox_asset_search\` calls covering theme + category (Models, Decals, Audio, Meshes, Animations).
- For each result, queue an \`insert_toolbox_asset\` action with scanScripts:true, removeUnsafeScripts:true, removeScriptsFromDecorativeAssets:true, freeOnly:true, requiresApprovalIfScriptsFound:true.
- Always include a 1-line safetyNotes line per inserted asset: "Scanned for unsafe scripts before insertion."
- If the user asked for "a sword", "a shop building", "a pet model", queue ONE insert. If they asked for "trees + rocks + buildings", queue MANY (8+).
- For audio (music, SFX), use the \`sound\` action with the assetId so it parents under SoundService and is preloaded.
- Never tell the user "open Toolbox yourself" — YOU search and YOU insert.`,
  },
  {
    id: "clothing",
    label: "Clothing Studio",
    emoji: "👕",
    hint: "Design shirts, pants, outfits & accessories",
    addendum: `### CLOTHING STUDIO MODE
The user wants to create Roblox wearables — shirts, pants, T-shirts, uniforms, full outfits, or accessories (hats, glasses, masks, backpacks, chains, wings, hair, shoulder items).
- For shirts/pants/uniforms/outfits: call \`generate_clothing\` with kind "classic_shirt" or "classic_pants". For a full outfit, generate BOTH and keep one consistent palette/theme. Embed each returned \`markdown\` so the user sees the preview, then give the upload steps.
- For a torso graphic / logo tee: use kind "tshirt".
- For hoodies, jackets, layered clothing, and ALL 3D accessories: say in ONE friendly sentence that these are 3D mesh items, so you're generating the design art + a build spec (not a ready mesh). Call \`generate_clothing\` with kind "layered_or_accessory", then give the build spec: silhouette, attachment point, scale, and texture notes, plus the Blender → Studio Accessory Fitting Tool path.
- If the user uploaded a reference image, base the design on it (colors, motifs, vibe) — describe what you see and match it.
- Always honor the user's exact colors and theme. Original designs only — never real brands or copyrighted characters.
- Be warm and premium: a user typing "make me a black and red cyber hoodie" should get a great preview and clear next steps, fast.`,
  },
  {
    id: "finish",
    label: "Finish My Game",
    emoji: "🏁",
    hint: "Fill in missing systems for a shippable game",
    addendum: `### FINISH GAME MODE
Analyze the live workspace + existing project files. Identify what's MISSING for a shippable Roblox game, then build it in one batch.
Required for a shippable game: spawn area, core loop, leaderstats currency, DataStore save, server-authoritative shop, at least one Gamepass scaffold, UI (HUD + shop + settings), Lighting + ambient sound, 1-2 toolbox decorative passes, anti-exploit on all remotes, test steps.
- For each missing piece, queue the smallest cohesive action set that gets it working.
- Never rebuild something that already exists — MODIFY in place.
- End with a clear "Next task" suggesting what to ship next (marketing icon, thumbnail, badge system, etc.).`,
  },
];

export const AI_MODE_IDS = AI_MODES.map((m) => m.id) as [AiModeId, ...AiModeId[]];

export function getAiModeAddendum(mode: string | null | undefined): string {
  if (!mode) return "";
  const found = AI_MODES.find((m) => m.id === mode);
  return found?.addendum ?? "";
}
