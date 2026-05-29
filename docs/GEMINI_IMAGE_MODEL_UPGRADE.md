# Gemini Image Model — Upgrade + Future-Proofing

Replace src/lib/image-gen.server.ts and redeploy.

## Why this matters (important)
Google is SHUTTING DOWN your current image model on **June 25, 2026**:
"gemini-3.1-flash-image-preview and gemini-3-pro-image-preview are deprecated and
will be shut down on 2026-06-25." (Google AI release notes.)

If you do nothing, clothing + image generation STOPS WORKING that day. This update
prevents that.

## What changed
The image generator no longer hardcodes one model. It now tries an ordered list of
models and automatically falls through to the next if one is unavailable
(404 / "not found" / "deprecated"):

  1. GEMINI_IMAGE_MODEL secret (if you set one) — tried first
  2. GEMINI_IMAGE_MODEL_FALLBACKS secret (comma-separated, optional)
  3. Built-in fallbacks: gemini-3-flash-image, gemini-3.1-flash-image, gemini-2.5-flash-image

So when the preview model dies, generation keeps working via a fallback, and you can
point GEMINI_IMAGE_MODEL at the new official model name the moment Google publishes
it — WITHOUT another code change.

## What you should do
1. Deploy this file.
2. For now it keeps working on your current model.
3. When Google announces the stable (GA) image model name (replacing the preview),
   add a Lovable secret:
   - Name: GEMINI_IMAGE_MODEL
   - Value: <the new model name>
   Then republish. No code edit needed.

## Honest notes
- I could not find Google's confirmed STABLE image-model name yet (only the
  deprecation notice for the previews). That's exactly why this uses a configurable
  list + fallback instead of hardcoding a name that might also be wrong.
- The doc you sent (gemini-3.5-flash) is a TEXT model — it does not generate images,
  so it was not used here. Image generation needs the "-image" model family.
- This does NOT change your rate limit. More generations still requires billing
  enabled on your Gemini key.

Verified: tsc --noEmit passes, npm run build passes.
