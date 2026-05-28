# Smartest AI Builder Upgrade for BloxSmith

This document defines the product and engineering standard for making BloxSmith feel like the smartest Roblox AI builder available.

## Goal

BloxSmith should not behave like a normal chat bot. It should behave like a senior Roblox developer inside the user's project. It should plan, generate, insert, test, validate, fix, create images, and remember.

## Core user promise

> Tell BloxSmith what you want. It builds real Roblox Studio-ready systems: maps, scripts, GUIs, assets, remotes, saving, shops, NPCs, images, thumbnails, icons, decals, and full playable game loops.

## Required AI workflow

Every actionable request should follow this internal flow:

1. **Understand** the user request, including typos, slang, short prompts, and vague wording.
2. **Scan** live Studio context, saved project files, memory, previous generations, screenshots, and known errors.
3. **Classify** the request as BUILD, EDIT, FIX, POLISH, ASSET, IMAGE, QUESTION, MCP, or BILLING.
4. **Plan** the Roblox service layout or image export target.
5. **Generate** Studio-ready files, plugin actions, or Roblox-ready images.
6. **Validate** safety, path placement, server/client trust boundaries, Remotes, DataStores, mobile UI, and image aspect ratio.
7. **Queue** actions for the plugin when Studio changes are needed.
8. **Remember** what was built so future requests continue correctly.
9. **Report** exactly what was prepared without pretending the plugin already applied it.

## Mobile-first builder requirements

The screenshot showed the current builder feels cramped on iPhone. The builder must be fixed for real mobile use.

### Required mobile fixes

- Support 360px wide screens without horizontal overflow.
- Make chat response cards fit the screen width with proper padding.
- Reduce huge mobile text inside AI responses.
- Put mode/action cards like Autopilot, Plan, Chat, and Auto Preview into a horizontal scroll row or a two-row responsive grid.
- Keep the bottom composer usable above the iOS Safari address bar and home indicator.
- Add `env(safe-area-inset-bottom)` and `env(safe-area-inset-top)` padding.
- Keep scrolling inside the AI chat panel, not the entire page.
- Make all tap buttons at least 44px tall/wide.
- Avoid fixed desktop widths on chat messages, input boxes, and toolbar buttons.
- Hide or collapse secondary labels on very small screens.
- The floating chat/support button should not cover the input composer.

### Suggested mobile CSS behavior

```css
@media (max-width: 640px) {
  .builder-shell {
    width: 100vw;
    max-width: 100vw;
    overflow-x: hidden;
  }

  .builder-toolbar {
    display: flex;
    overflow-x: auto;
    gap: 0.5rem;
    padding-inline: 0.75rem;
    scroll-snap-type: x mandatory;
  }

  .builder-mode-card {
    min-width: 8rem;
    scroll-snap-align: start;
  }

  .chat-panel {
    padding-inline: 0.75rem;
    overflow-y: auto;
    overflow-x: hidden;
  }

  .chat-message {
    max-width: 100%;
    font-size: 0.95rem;
    line-height: 1.55;
    word-break: break-word;
  }

  .chat-composer {
    position: sticky;
    bottom: 0;
    padding-bottom: calc(0.75rem + env(safe-area-inset-bottom));
  }

  .chat-action-button {
    min-width: 44px;
    min-height: 44px;
  }
}
```

## Image generation button requirement

The current AI response says it cannot directly generate or draw a brand-new image. That is not good enough for BloxSmith.

Add a clear **Generate Image** button in the builder composer/tool row. It should be separate from uploading an image.

### Button behavior

The button should let users generate:

- Roblox game thumbnails
- Roblox game icons
- Decals
- Badges
- Gamepass icons
- Group images
- Loading screens
- UI art
- Promo banners
- TikTok/Reels/Shorts images

### Presets

| Preset | Aspect ratio | Roblox use |
|---|---:|---|
| Game Thumbnail | 16:9 | Roblox thumbnail / promo banner |
| Game Icon | 1:1 | Roblox game icon |
| Decal / Badge / Gamepass | 1:1 | Roblox decal, badge, gamepass icon, UI image |
| Mobile Promo | 9:16 | TikTok, Reels, Shorts |

### AI behavior for images

When the user asks for an image, thumbnail, icon, logo, decal, badge, banner, poster, or promo art, classify it as `IMAGE`.

The AI should say something like:

> Generated a Roblox-ready 16:9 thumbnail preview for your game.

It should not say:

> I cannot directly generate or draw a brand-new image file.

If the image provider is missing, the AI should say:

> Image generation is not connected yet — add an image provider key and I’ll generate Roblox thumbnails, icons, decals, and promo art.

## Must-have intelligence features

### 1. Project scanner awareness

The AI must use the live Studio context and project file map before making changes. It should know what already exists and avoid duplicate systems.

### 2. Real edit-mode insertion

Generated objects must appear in Roblox Studio edit mode, not only during Play mode. World objects belong under `Workspace`. GUIs belong in `StarterGui`. Scripts must be placed in the correct service.

### 3. Auto-fix behavior

When a user pastes an error, the AI should patch the likely script and add guards, instead of only explaining the error.

### 4. Full game templates

A full-game request should generate a playable starter stack:

- Map/lobby
- Core loop
- Currency/progression
- Leaderstats
- Save system
- Shop/upgrades
- UI/HUD
- Remotes
- Mobile support
- Publish checklist

### 5. Roblox safety

The AI must block dangerous patterns:

- `loadstring`
- suspicious `require(assetId)`
- hidden backdoor scripts
- unexpected `HttpService` calls
- obfuscated script payloads
- client-trusted currency/rewards/damage

### 6. Better responses

The AI should say:

> Prepared the mining simulator system and queued the map, scripts, HUD, remotes, and save logic for Studio.

It should not say:

> Done, I created it.

unless the plugin already confirmed the actions were applied.

## Recommended route integration

Import the core prompt into the existing AI gateway/system prompt:

```ts
import { SMART_BUILDER_SYSTEM_UPGRADE } from "./ai-smartest-builder-core";
```

Then append it near the top of the system prompt so every AI route gets the same rules.

## Recommended eval checks

The AI should be tested against these prompts:

1. `make me a mining simulator with pets, backpacks, ores, rebirths and a shop`
2. `fix my datastore not saving`
3. `make the UI premium and animated for mobile`
4. `add a sword combat system with remotes and cooldowns`
5. `insert a free lobby map and make sure no unsafe scripts are inside`
6. `make a horror game flashlight, chase NPC, scary lighting and doors`
7. `my RemoteEvent gives coins but exploiters can spam it fix it`
8. `make everything look better`
9. `generate a Roblox thumbnail for my obby game`
10. `make me a 1:1 Roblox game icon with a cute dog`
11. `create a decal image for a pet simulator egg`
12. `fix the mobile chat because the message box is too wide on iPhone`

A good answer must queue files/actions or generate the requested image, use correct Roblox service locations, validate server/client boundaries, avoid fake success claims, and stay mobile friendly.

## Product features to prioritize next

1. Mobile responsive builder layout.
2. Generate Image button in the composer.
3. Roblox image presets for 16:9, 1:1, and 9:16.
4. Plugin confirmation messages back to the website.
5. Undo/rollback for last generation.
6. Visual action preview before pushing to Studio.
7. Project scan panel showing scripts, GUIs, Remotes, missing objects, and likely errors.
8. Template picker for Mining Simulator, Tycoon, Obby, Horror, RPG, Pet Simulator, Tower Defense, and Roleplay City.
9. Asset safety scanner for toolbox imports.
10. AI memory viewer so owners can see what the AI remembers per project.
11. One-click publish checklist.

## Definition of "smartest"

BloxSmith is smarter when it:

- understands messy human requests,
- builds instead of lectures,
- generates Roblox-ready images,
- works properly on mobile,
- places things correctly,
- fixes its own mistakes,
- remembers the project,
- keeps games safe from exploiters,
- makes UI mobile-friendly,
- and proves what it queued or generated.
