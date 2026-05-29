// Studio image generation (multi-variation generator UI) — Gemini backend.
//
// This routes the dedicated /image-generator studio through the SAME Google
// Gemini pipeline the clothing studio and in-chat tools use, so there is ONE
// image backend and ONE key to configure (GEMINI_API_KEY). The older Lovable
// gateway path was removed because the project only has a Gemini key.

import { generateImageFromPrompt } from "./image-gen.server";

// UI exposes several model ids; with a Gemini-only key we map them all to the
// configured Gemini image model. The mapping is kept so the UI/types don't have
// to change, and so a future multi-provider key can re-expand this cleanly.
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

// Gemini generateContent supports these aspect ratios for gemini-3 image models.
// Map any unsupported studio ratios to the closest supported one.
function toGeminiAspect(a: Aspect): "16:9" | "1:1" | "9:16" | "4:3" | "3:4" {
  switch (a) {
    case "3:2":
      return "4:3";
    case "2:3":
      return "3:4";
    default:
      return a;
  }
}

function parseDataUrl(dataUrl?: string): { base64: string; mime: string } | null {
  if (!dataUrl?.startsWith("data:image/")) return null;
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return null;
  const mime = dataUrl.slice(5, dataUrl.indexOf(";"));
  return { base64: dataUrl.slice(comma + 1), mime };
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
  const basePrompt = [
    opts.prompt,
    opts.styleHint,
    ASPECT_HINTS[opts.aspectRatio],
    opts.negativePrompt ? `Avoid: ${opts.negativePrompt}.` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const ref = parseDataUrl(opts.referenceImageDataUrl);

  const result = await generateImageFromPrompt({
    userId: opts.userId,
    prompt: basePrompt,
    aspectRatio: toGeminiAspect(opts.aspectRatio),
    referenceImageBase64: ref?.base64,
    referenceMime: ref?.mime,
    altText: opts.altText,
  });

  if ("error" in result) {
    throw new Error(result.error);
  }

  return {
    url: result.imageUrl,
    modelUsed: result.modelUsed || process.env.GEMINI_IMAGE_MODEL || "gemini-3.1-flash-image-preview",
    fellBack: false,
    promptUsed: basePrompt,
  };
}
