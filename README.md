# BloxSmith — 3D Preview, Help Button & Credit Fixes

Copy each file over the same path in your project, then redeploy.

## What changed

### Fixed: 3D clothing preview (the black-blocks bug)
- **src/components/ClothingPreview3D.tsx** — rewritten. The old version mapped the
  WHOLE Roblox template sheet onto each box face, so the big dark areas of the
  template rendered as giant black blocks (what your screenshot showed). Now each
  body part (torso front/back/sides, sleeves, legs) samples ONLY its correct
  rectangle of the 585×559 classic template, so the design appears FITTED on the
  avatar. Added full orbit controls: drag to rotate, scroll/pinch to zoom,
  two-finger / right-drag to pan, with an on-screen hint.
- **src/routes/clothing.tsx** — the 3D view container is now responsive
  (360px mobile → 460px tablet → 560px desktop).

Honest note: this is still an APPROXIMATION on a blocky R6-style avatar for a quick
visual check — it is not Roblox's pixel-perfect wrap. The downloadable PNG is the
real upload asset. The template-region coordinates are tuned to the standard R6
layout; if a specific design looks slightly off at a seam, that's the approximation,
not a broken texture.

### Improved: AI Help button
- **src/components/HelpChat.tsx** — the launcher is now a polished circular button
  in the bottom-right (gradient, bot icon, online dot), safe-area aware so it clears
  mobile home indicators. The chat panel opens as a full side sheet on mobile and a
  docked card bottom-right on desktop, instead of the old left-edge tab.

### Added: clear credit costs + out-of-credits blocking
- **src/routes/clothing.tsx** and **src/routes/image-generator.tsx** — both now show
  your live credit balance and the cost up front. When you can't afford it, the
  Generate button is disabled and an amber banner links to /pricing. Clothing costs
  2 credits; image gen costs 2 per variation — matching, and still charged ONLY on
  success (failures refund automatically).

### Changelog
- **src/routes/changelog.tsx** — new v2.9.1 entry documenting all of the above.

## Still requires (unchanged from before)
- `GEMINI_API_KEY` must be set on your server for any image/clothing generation.
- Without it, generators show a clear message and charge no credits.

## NOT addressed in this pass (be aware)
You also asked to "make sure all AI models work and any prompt executes in my game
on Roblox." That is the chat → plugin → Studio build pipeline — a separate, large
system from these creative tools, and not something changed here. Whether prompts
execute in-game depends on your server keys being set and the plugin being connected
and live; it can't be verified from the frontend code. If in-game execution is
failing, send the specific error and that can be investigated on its own.

## Verified
- `npx tsc --noEmit` passes
- `npm run build` passes (client + SSR); three.js stays in lazy chunks so the 3D
  preview never affects initial load or server rendering.
