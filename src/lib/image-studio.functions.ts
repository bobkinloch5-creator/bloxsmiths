// Powerful image studio: multi-model image generation via Lovable AI Gateway
// with graceful fallback to the existing Gemini-direct pipeline.
//
// Models supported (Lovable AI Gateway):
//   - google/gemini-2.5-flash-image           (fast, default)
//   - google/gemini-3-pro-image-preview       (high quality)
//   - google/gemini-3.1-flash-image-preview   (fast, pro-quality)
//   - openai/gpt-image-2                      (premium)
//   - openai/gpt-image-1-mini                 (cheap)
//
// Variations (n=1..4), aspect ratio, quality, optional reference image, and a
// negative prompt are all exposed to the UI.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";

const ModelEnum = z.enum([
  "google/gemini-2.5-flash-image",
  "google/gemini-3-pro-image-preview",
  "google/gemini-3.1-flash-image-preview",
  "openai/gpt-image-2",
  "openai/gpt-image-1-mini",
]);

const AspectEnum = z.enum(["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"]);
const QualityEnum = z.enum(["low", "medium", "high"]);

const InputSchema = z.object({
  prompt: z.string().min(3).max(2000),
  negativePrompt: z.string().max(500).optional(),
  model: ModelEnum.default("google/gemini-2.5-flash-image"),
  aspectRatio: AspectEnum.default("1:1"),
  quality: QualityEnum.default("low"),
  variations: z.number().int().min(1).max(4).default(1),
  stylePreset: z.string().max(80).optional(),
  referenceImageDataUrl: z
    .string()
    .regex(/^data:image\/(png|jpeg|jpg|webp);base64,/)
    .max(8_000_000)
    .optional(),
});

export type GenerateImageInput = z.infer<typeof InputSchema>;
export type GeneratedImage = { url: string; model: string };
export type GenerateImageResult =
  | { ok: true; images: GeneratedImage[]; modelUsed: string; fellBack: boolean }
  | { ok: false; error: string };

type ModelId = string;

const ASPECT_HINTS: Record<string, string> = {
  "1:1": "Square 1:1 composition, subject centered.",
  "16:9": "Wide 16:9 landscape composition.",
  "9:16": "Tall 9:16 vertical composition.",
  "4:3": "4:3 landscape composition.",
  "3:4": "3:4 portrait composition.",
  "3:2": "3:2 landscape composition.",
  "2:3": "2:3 portrait composition.",
};

const STYLE_HINTS: Record<string, string> = {
  photoreal: "Photorealistic, sharp detail, natural lighting, 35mm photo.",
  cinematic: "Cinematic lighting, dramatic shadows, film grain, anamorphic.",
  anime: "Anime style, clean lineart, vibrant colors, cel shading.",
  "3d-render": "High-quality 3D render, Octane, ray traced, soft global illumination.",
  pixel: "Pixel art, 16-bit, crisp pixels, retro game aesthetic.",
  watercolor: "Soft watercolor painting, paper texture, flowing pigments.",
  cyberpunk: "Cyberpunk, neon, rain-soaked streets, holograms.",
  minimalist: "Minimalist, lots of negative space, simple shapes, muted palette.",
  roblox: "Roblox-style 3D, blocky stylized characters, vibrant colors.",
  logo: "Clean vector logo, solid colors, centered, on white background.",
};

async function uploadPng(userId: string, bytes: Buffer, mime: string): Promise<string | null> {
  const ext = /jpe?g/i.test(mime) ? "jpg" : "png";
  const filename = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabaseAdmin.storage
    .from("generated-images")
    .upload(filename, bytes, { contentType: mime || "image/png", upsert: false });
  if (error) return null;
  const { data: pub } = supabaseAdmin.storage.from("generated-images").getPublicUrl(filename);
  return pub.publicUrl;
}

/** Call Lovable AI Gateway `/v1/images/generations` with the right body shape per model. */
async function callGateway(opts: {
  model: string;
  prompt: string;
  aspectRatio: string;
  quality: string;
  apiKey: string;
}): Promise<{ b64: string; mime: string } | { error: string; status: number }> {
  const isOpenAI = opts.model.startsWith("openai/");
  const body: Record<string, unknown> = isOpenAI
    ? {
        model: opts.model,
        prompt: opts.prompt,
        quality: opts.quality,
        n: 1,
      }
    : {
        model: opts.model,
        messages: [{ role: "user", content: opts.prompt }],
        modalities: ["image", "text"],
      };

  try {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      return { error: txt.slice(0, 300) || `HTTP ${r.status}`, status: r.status };
    }
    const j: { data?: Array<{ b64_json?: string }> } = await r.json();
    const b64 = j?.data?.[0]?.b64_json;
    if (!b64) return { error: "Gateway returned no image data.", status: 502 };
    return { b64, mime: "image/png" };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : String(e),
      status: 500,
    };
  }
}

export const generateImageStudio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data, context }): Promise<GenerateImageResult> => {
    const { userId } = context as { userId: string };

    // Reuse hourly limit guard from the existing helper.
    const { checkImageHourlyLimit, generateImageFromPrompt } = await import("./image-gen.server");
    const limitErr = await checkImageHourlyLimit(userId);
    if (limitErr) return { ok: false, error: limitErr };

    const styleHint = data.stylePreset ? STYLE_HINTS[data.stylePreset] : "";
    const negHint = data.negativePrompt ? `Avoid: ${data.negativePrompt}.` : "";
    const fullPrompt = [
      data.prompt,
      styleHint,
      ASPECT_HINTS[data.aspectRatio],
      negHint,
    ]
      .filter(Boolean)
      .join("\n\n");

    const lovableKey = process.env.LOVABLE_API_KEY;
    let modelUsed: ModelId = data.model;
    let fellBack = false;
    const images: GeneratedImage[] = [];
    const errors: string[] = [];

    for (let i = 0; i < data.variations; i++) {
      let uploaded: string | null = null;

      // Primary: Lovable AI Gateway
      if (lovableKey) {
        const res = await callGateway({
          model: data.model,
          prompt: fullPrompt + (data.variations > 1 ? `\n\nVariation ${i + 1}.` : ""),
          aspectRatio: data.aspectRatio,
          quality: data.quality,
          apiKey: lovableKey,
        });
        if ("b64" in res) {
          uploaded = await uploadPng(userId, Buffer.from(res.b64, "base64"), res.mime);
          if (uploaded) {
            images.push({ url: uploaded, model: data.model });
            continue;
          }
        } else {
          errors.push(`${data.model}: ${res.error}`);
        }
      }

      // Fallback: existing direct Gemini path (uses GEMINI_API_KEY)
      const fb = await generateImageFromPrompt({
        userId,
        prompt: fullPrompt + (data.variations > 1 ? `\n\nVariation ${i + 1}.` : ""),
        aspectRatio: data.aspectRatio as "16:9" | "1:1" | "9:16" | "4:3" | "3:4",
        altText: data.prompt,
      });
      if ("error" in fb) {
        errors.push(`fallback: ${fb.error}`);
        continue;
      }
      fellBack = true;
      modelUsed = "google/gemini-2.5-flash-image (fallback)";
      images.push({ url: fb.imageUrl, model: modelUsed });
    }

    if (images.length === 0) {
      return {
        ok: false,
        error:
          errors[0] ??
          "Image generation failed. Please try a different model or simplify the prompt.",
      };
    }

    return { ok: true, images, modelUsed, fellBack };
  });
