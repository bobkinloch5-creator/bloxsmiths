import { generateText } from "ai";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createProvider } from "./ai-providers.server";

export type StudioImageModel =
  | "google/gemini-2.5-flash-image"
  | "google/gemini-3-pro-image-preview"
  | "google/gemini-3.1-flash-image-preview"
  | "openai/gpt-image-2"
  | "openai/gpt-image-1-mini";

type Quality = "low" | "medium" | "high";
type Aspect = "1:1" | "16:9" | "9:16" | "4:3" | "3:4" | "3:2" | "2:3";

export const GENERATOR_CREDIT_COSTS = {
  imagePerVariation: 2,
  clothing: 2,
} as const;

const ASPECT_HINTS: Record<Aspect, string> = {
  "1:1": "Square 1:1 composition, centered and clean.",
  "16:9": "Wide 16:9 Roblox thumbnail composition with strong focal depth.",
  "9:16": "Tall 9:16 mobile/vertical composition.",
  "4:3": "4:3 landscape composition.",
  "3:4": "3:4 portrait composition.",
  "3:2": "3:2 landscape composition.",
  "2:3": "2:3 portrait composition.",
};

const MODEL_FALLBACKS: Record<StudioImageModel, StudioImageModel[]> = {
  "google/gemini-2.5-flash-image": ["google/gemini-3.1-flash-image-preview", "openai/gpt-image-1-mini"],
  "google/gemini-3-pro-image-preview": ["google/gemini-3.1-flash-image-preview", "google/gemini-2.5-flash-image"],
  "google/gemini-3.1-flash-image-preview": ["google/gemini-2.5-flash-image", "openai/gpt-image-1-mini"],
  "openai/gpt-image-2": ["openai/gpt-image-1-mini", "google/gemini-3.1-flash-image-preview"],
  "openai/gpt-image-1-mini": ["google/gemini-2.5-flash-image", "google/gemini-3.1-flash-image-preview"],
};

function uniqueModels(models: StudioImageModel[]): StudioImageModel[] {
  return [...new Set(models)];
}

function parseReferenceImage(dataUrl?: string) {
  if (!dataUrl?.startsWith("data:image/")) return null;
  return dataUrl;
}

async function uploadGeneratedImage(userId: string, bytes: Buffer, mime: string) {
  const ext = /jpe?g/i.test(mime) ? "jpg" : "png";
  const filename = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabaseAdmin.storage
    .from("generated-images")
    .upload(filename, bytes, { contentType: mime || "image/png", upsert: false });
  if (error) throw new Error(`Could not save image: ${error.message}`);
  const { data } = supabaseAdmin.storage.from("generated-images").getPublicUrl(filename);
  return data.publicUrl;
}

async function maybeEnhancePrompt(prompt: string, mode: "image" | "clothing") {
  const neoKey = process.env.NEOKENS_API_KEY || process.env.NEOKENS_KEY;
  if (!neoKey) return prompt;

  try {
    const model = createProvider("neokens", neoKey)("gemini-3-flash");
    const system =
      mode === "clothing"
        ? "Rewrite the user's prompt into a concise premium Roblox clothing generation prompt. Keep it under 140 words. Preserve all requested colors, silhouettes, and motifs. Return plain text only."
        : "Rewrite the user's prompt into a concise premium Roblox image generation prompt for thumbnails, HUD art, icons, textures, UI graphics, or promo assets. Keep it under 140 words. Return plain text only.";
    const result = await generateText({
      model,
      system,
      prompt,
      maxOutputTokens: 220,
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(12_000),
    });
    return result.text?.trim() || prompt;
  } catch {
    return prompt;
  }
}

async function callImageGateway(opts: {
  model: StudioImageModel;
  prompt: string;
  quality: Quality;
  apiKey: string;
  referenceImageDataUrl?: string;
}) {
  const referenceImageDataUrl = parseReferenceImage(opts.referenceImageDataUrl);
  const isOpenAI = opts.model.startsWith("openai/");

  const body: Record<string, unknown> = isOpenAI
    ? {
        model: opts.model,
        prompt: referenceImageDataUrl
          ? `${opts.prompt}\n\nUse the uploaded reference image as inspiration for composition, shapes, and overall style.`
          : opts.prompt,
        quality: opts.quality,
        n: 1,
      }
    : {
        model: opts.model,
        messages: [
          {
            role: "user",
            content: referenceImageDataUrl
              ? [
                  { type: "text", text: opts.prompt },
                  { type: "image_url", image_url: { url: referenceImageDataUrl } },
                ]
              : opts.prompt,
          },
        ],
        modalities: ["image", "text"],
      };

  const response = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(75_000),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text.slice(0, 280) || `HTTP ${response.status}`);
  }

  const json: { data?: Array<{ b64_json?: string }> } = await response.json();
  const b64 = json.data?.[0]?.b64_json;
  if (!b64) throw new Error("No image data was returned by the model.");
  return Buffer.from(b64, "base64");
}

export async function generateStoredStudioImage(opts: {
  userId: string;
  prompt: string;
  altText: string;
  quality: Quality;
  aspectRatio: Aspect;
  model: StudioImageModel;
  negativePrompt?: string;
  styleHint?: string;
  referenceImageDataUrl?: string;
  mode: "image" | "clothing";
}) {
  const lovableKey = process.env.LOVABLE_API_KEY;
  if (!lovableKey) {
    throw new Error("Image generation is not connected on the server right now.");
  }

  const basePrompt = [
    opts.prompt,
    opts.styleHint,
    ASPECT_HINTS[opts.aspectRatio],
    opts.negativePrompt ? `Avoid: ${opts.negativePrompt}.` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const enhancedPrompt = await maybeEnhancePrompt(basePrompt, opts.mode);
  const attempts = uniqueModels([opts.model, ...MODEL_FALLBACKS[opts.model]]);
  const errors: string[] = [];

  for (let index = 0; index < attempts.length; index += 1) {
    const model = attempts[index];
    try {
      const bytes = await callImageGateway({
        model,
        prompt: enhancedPrompt,
        quality: opts.quality,
        apiKey: lovableKey,
        referenceImageDataUrl: opts.referenceImageDataUrl,
      });
      const url = await uploadGeneratedImage(opts.userId, bytes, "image/png");
      return {
        url,
        modelUsed: model,
        fellBack: index > 0,
        promptUsed: enhancedPrompt,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${model}: ${message}`);
    }
  }

  throw new Error(errors[0] ?? "Image generation failed.");
}