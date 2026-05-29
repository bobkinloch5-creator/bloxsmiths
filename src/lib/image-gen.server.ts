// Shared image-generation helper.
//
// Wraps the Google Gemini image API + Supabase storage upload so multiple
// tools (thumbnail generator, clothing/accessory studio) can generate images
// without duplicating the Gemini call, error handling, and upload logic.
//
// NOTE: the existing `generate_image` tool in ai-tools.server.ts has its own
// inline copy of this flow. That copy is a working, gated money-path and is
// intentionally left untouched to avoid regressions — new tools use this
// helper instead.

import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type GenImageResult = { imageUrl: string; markdown: string; modelUsed?: string } | { error: string };

const ASPECT_HINTS: Record<string, string> = {
  "16:9": "Compose as a wide 16:9 landscape image.",
  "1:1": "Compose as a perfectly square 1:1 image with the subject centered.",
  "9:16": "Compose as a tall 9:16 vertical/portrait image.",
  "4:3": "Compose as a 4:3 landscape image.",
  "3:4": "Compose as a 3:4 portrait image.",
};

async function saveImage(
  userId: string | undefined,
  bytes: Buffer,
  mime: string,
  altText: string,
  modelUsed?: string,
): Promise<GenImageResult> {
  const ext = /jpe?g/i.test(mime) ? "jpg" : "png";
  const filename = `${userId ?? "anon"}/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}.${ext}`;
  const { error: upErr } = await supabaseAdmin.storage
    .from("generated-images")
    .upload(filename, bytes, { contentType: mime || "image/png", upsert: false });
  if (upErr) return { error: `Could not save image: ${upErr.message}` };
  const { data: pub } = supabaseAdmin.storage.from("generated-images").getPublicUrl(filename);
  return {
    imageUrl: pub.publicUrl,
    markdown: `![${altText.slice(0, 80)}](${pub.publicUrl})`,
    modelUsed,
  };
}

/**
 * Per-user hourly cap on generations, counted from the storage bucket so no
 * extra table is needed. Fails OPEN — a transient listing error never blocks a
 * paying user. Returns an error string if over the limit, otherwise null.
 */
export async function checkImageHourlyLimit(userId: string): Promise<string | null> {
  const HOURLY_LIMIT = Number(process.env.GEMINI_IMAGE_HOURLY_LIMIT || "30");
  if (HOURLY_LIMIT <= 0) return null;
  try {
    const { data: recent } = await supabaseAdmin.storage
      .from("generated-images")
      .list(userId, { limit: 100, sortBy: { column: "created_at", order: "desc" } });
    const cutoff = Date.now() - 60 * 60 * 1000;
    const lastHour = (recent ?? []).filter(
      (o: { created_at?: string | null; updated_at?: string | null }) => {
        const t = Date.parse(o?.created_at ?? o?.updated_at ?? "");
        return Number.isFinite(t) && t >= cutoff;
      },
    ).length;
    if (lastHour >= HOURLY_LIMIT) {
      return `You've reached the image limit (${HOURLY_LIMIT}/hour). Try again later.`;
    }
  } catch {
    // fail open
  }
  return null;
}

/**
 * Generate an image from a text prompt (optionally guided by a reference image)
 * via Google Gemini, upload it, and return the public URL + markdown.
 */
export async function generateImageFromPrompt(opts: {
  userId?: string;
  prompt: string;
  aspectRatio?: "16:9" | "1:1" | "9:16" | "4:3" | "3:4";
  referenceImageBase64?: string; // raw base64 (no data: prefix)
  referenceMime?: string;
  altText?: string;
}): Promise<GenImageResult> {
  const aspectRatio = opts.aspectRatio ?? "1:1";
  const fullPrompt = `${opts.prompt}\n\n${ASPECT_HINTS[aspectRatio] ?? ""}`.trim();

  const neokensKey =
    process.env.NEOKENS_API_KEY ||
    process.env.NEOKENS_KEY;

  if (neokensKey) {
    try {
      const messages = [];
      if (opts.referenceImageBase64) {
        messages.push({
          role: "user",
          content: [
            { type: "text", text: fullPrompt },
            {
              type: "image_url",
              image_url: {
                url: `data:${opts.referenceMime || "image/png"};base64,${opts.referenceImageBase64}`,
              },
            },
          ],
        });
      } else {
        messages.push({ role: "user", content: fullPrompt });
      }

      const r = await fetch("https://api.quatarly.cloud/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${neokensKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gemini-3.1-flash-image",
          messages,
        }),
        signal: AbortSignal.timeout(60_000),
      });

      if (r.ok) {
        const j: any = await r.json();
        const images = j?.choices?.[0]?.message?.images ?? [];
        const imgItem = images[0];
        const dataUrl = imgItem?.image_url?.url || imgItem?.url;

        if (dataUrl) {
          const comma = dataUrl.indexOf(",");
          if (comma >= 0) {
            const mime = dataUrl.slice(5, dataUrl.indexOf(";"));
            const base64 = dataUrl.slice(comma + 1);

            return await saveImage(
              opts.userId,
              Buffer.from(base64, "base64"),
              mime,
              opts.altText ?? opts.prompt,
              "gemini-3.1-flash-image",
            );
          }
        }
      } else {
        const txt = await r.text().catch(() => "");
        console.error(`Neokens image generation API returned error (HTTP ${r.status}): ${txt}`);
      }
    } catch (e: any) {
      console.error("Neokens image generation error, trying direct Gemini fallback:", e);
    }
  }

  const geminiKey =
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
    process.env.GOOGLE_API_KEY;

  if (!geminiKey) {
    return {
      error:
        "Image generation is unavailable — set GEMINI_API_KEY (your Google Gemini key) or NEOKENS_KEY on the server to enable clothing/texture generation.",
    };
  }

  // Gemini image models. The -preview models (gemini-3.1-flash-image-preview /
  // gemini-3-pro-image-preview) are deprecated and shut down on 2026-06-25, so we
  // keep an ordered candidate list and fall through to the next one if a model is
  // unavailable (404 / "not found" / "deprecated"). Set GEMINI_IMAGE_MODEL to pin
  // a specific model (e.g. the new GA name once Google publishes it) — it's tried
  // first. Add more comma-separated fallbacks via GEMINI_IMAGE_MODEL_FALLBACKS.
  const primary = process.env.GEMINI_IMAGE_MODEL || "gemini-3.1-flash-image-preview";
  const fallbackList = (process.env.GEMINI_IMAGE_MODEL_FALLBACKS || "")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  const modelCandidates = [
    primary,
    ...fallbackList,
    // Built-in fallbacks (most→least preferred). Harmless if a name is invalid:
    // we only advance to the next when the current one reports unavailable.
    "gemini-3-flash-image",
    "gemini-3.1-flash-image",
    "gemini-2.5-flash-image",
  ].filter((m, i, arr) => arr.indexOf(m) === i); // de-dupe, keep order

  const buildGenerationConfig = (model: string) => {
    const cfg: { responseModalities: string[]; imageConfig?: { aspectRatio: string } } = {
      responseModalities: ["TEXT", "IMAGE"],
    };
    if (/gemini-3/.test(model)) cfg.imageConfig = { aspectRatio };
    return cfg;
  };

  const parts: Array<Record<string, unknown>> = [{ text: fullPrompt }];
  if (opts.referenceImageBase64) {
    parts.push({
      inlineData: {
        mimeType: opts.referenceMime || "image/png",
        data: opts.referenceImageBase64,
      },
    });
  }

  // Try each candidate model; advance only on "model unavailable" errors.
  let lastModelError = "";
  for (let i = 0; i < modelCandidates.length; i++) {
    const model = modelCandidates[i];
    const isLast = i === modelCandidates.length - 1;
    try {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: { "x-goog-api-key": geminiKey, "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts }],
            generationConfig: buildGenerationConfig(model),
          }),
          signal: AbortSignal.timeout(60_000),
        },
      );
      if (!r.ok) {
        const txt = await r.text().catch(() => "");
        // Model-unavailable → try the next candidate instead of failing.
        const modelUnavailable =
          r.status === 404 ||
          /not found|deprecated|unsupported|not supported|no longer available|invalid model|model_not_found/i.test(
            txt,
          );
        if (modelUnavailable && !isLast) {
          lastModelError = `${model}: HTTP ${r.status}`;
          continue;
        }
        if (r.status === 429)
          return { error: "Image generation is rate-limited right now. Try again in a moment." };
        if (r.status === 400 && /billing|quota|FAILED_PRECONDITION/i.test(txt))
          return {
            error:
              "Gemini rejected the request — the image models need a Google API key with billing enabled. Check GEMINI_API_KEY.",
          };
        if (r.status === 401 || r.status === 403)
          return { error: "Gemini rejected the API key (check GEMINI_API_KEY on the server)." };
        return { error: `Image generation failed (HTTP ${r.status}): ${txt.slice(0, 200)}` };
      }
      // Success — parse below using this response.
      return await parseImageResponse(r, opts, model);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/abort|timeout/i.test(msg))
        return { error: "Image generation timed out. Please try again in a moment." };
      if (!isLast) {
        lastModelError = `${model}: ${msg}`;
        continue;
      }
      return { error: `Image generation error: ${msg}` };
    }
  }
  return {
    error: `No available Gemini image model. Tried: ${modelCandidates.join(", ")}. Last error: ${lastModelError}. Set GEMINI_IMAGE_MODEL to a model your key supports.`,
  };
}

// Parse a successful Gemini generateContent image response and save it.
async function parseImageResponse(
  r: Response,
  opts: { userId?: string; prompt: string; altText?: string },
  model?: string,
): Promise<GenImageResult> {
  try {
    const j: {
      candidates?: Array<{
        content?: {
          parts?: Array<Record<string, { data?: string; mimeType?: string; mime_type?: string }>>;
        };
        finishReason?: string;
      }>;
      promptFeedback?: { blockReason?: string };
    } = await r.json();
    const respParts = j?.candidates?.[0]?.content?.parts ?? [];
    const imgPart = respParts.find((p) => p?.inlineData?.data || p?.inline_data?.data);
    const inline = imgPart?.inlineData ?? imgPart?.inline_data;
    if (!inline?.data) {
      const block =
        j?.promptFeedback?.blockReason || j?.candidates?.[0]?.finishReason || "no image returned";
      return {
        error: `The model did not return an image (${block}). Try rephrasing, or remove anything that might trip safety filters.`,
      };
    }
    return await saveImage(
      opts.userId,
      Buffer.from(inline.data, "base64"),
      inline.mimeType || inline.mime_type || "image/png",
      opts.altText ?? opts.prompt,
      model,
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/abort|timeout/i.test(msg)) {
      return { error: "Image generation timed out. Please try again in a moment." };
    }
    return { error: `Image generation error: ${msg}` };
  }
}
