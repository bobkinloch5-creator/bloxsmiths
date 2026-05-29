# BloxSmith — Image & Clothing Generator Fixes

These are the files I changed. Drop each one into your project at the SAME path
shown below (overwrite the existing file), then redeploy. The folder structure
here mirrors your repo, so you can copy `src/` over your `src/`.

## ⚠️ One required config step
Everything here generates images through **Google Gemini**. It will NOT work until
you set this environment variable on your server (Lovable Cloud / Cloudflare):

    GEMINI_API_KEY = <your Google Gemini API key>

Optional override (defaults to a current fast model if unset):

    GEMINI_IMAGE_MODEL = gemini-3.1-flash-image-preview
    # alternatives: gemini-3-pro-image-preview (higher quality, slower)
    #               gemini-2.5-flash-image (older fallback)

If the key is missing, generators return a clear "set GEMINI_API_KEY" message and
NO credits are charged.

Note: Neokens / Quatarly (your chat AI provider) is TEXT-ONLY and cannot make
images — that's why image generation uses Gemini, not Neokens.

---

## What each file does

### Creative tools (the main fixes)
- **src/routes/clothing.tsx** — Clothing studio UI. Adds a Flat/3D preview toggle,
  staged loading messages, reliable blob download, and a credit-cost hint.
- **src/components/ClothingPreview3D.tsx** — NEW. Client-only WebGL preview that
  wraps the generated texture onto a rotating avatar. Lazy-loaded so it never
  breaks server-side rendering.
- **src/lib/clothing.functions.ts** — Clothing server function. Charges credits
  ONLY on success, refunds on failure, runs through the Gemini pipeline.
- **src/routes/image-generator.tsx** — Image studio UI. Gemini-only model list,
  newest default model, plus Roblox asset-type presets (thumbnail, icon, HUD,
  texture, gamepass, decal).
- **src/lib/generator-images.server.ts** — Repointed the image studio backend
  from the Lovable gateway to the Gemini pipeline (one key for everything).
- **src/lib/image-gen.server.ts** — Added a 60s request timeout + friendly
  timeout error so a stuck Gemini call fails cleanly instead of hanging.

### Supporting changes
- **src/components/layout.tsx** — Nav "Images" link (unchanged behavior; included
  because it was touched during the image-generator removal/restore).
- **src/routes/__root.tsx** — Removed leftover duplicate "Site Fixer Pro" meta
  tags that could cause a hydration mismatch and bad SEO.
- **src/routes/sitemap[.]xml.ts** — Sitemap entries kept in sync.
- **src/routes/changelog.tsx** — Added a v2.9.0 entry documenting all of the above.
- **src/routeTree.gen.ts** — Auto-generated route tree (regenerates on build, but
  included so the zip builds as-is).

---

## Verified
- `npx tsc --noEmit` — passes (no type errors)
- `npm run build` — passes (client + SSR build succeed)
- three.js / react-three-fiber are split into lazy chunks, so the 3D preview only
  loads when opened and does not affect initial page load or SSR.

## Honest limitations
- The 3D preview is an APPROXIMATION (texture on a simple humanoid) to check colors
  and placement — it is not Roblox's exact template wrap. The downloadable PNG is
  the real upload asset.
- OpenAI image models were removed from the picker because your key is Gemini-only.
  If you later add an OpenAI/other key, the model list can be re-expanded.
