import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { generateStoredStudioImage, GENERATOR_CREDIT_COSTS, type StudioImageModel } from "./generator-images.server";
import { ensureCreditsAvailable, isGeneratorOwner, spendCreditsAfterSuccess } from "./generator-credits.server";

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
  | { ok: true; images?: GeneratedImage[]; jobIds?: string[]; modelUsed: string; fellBack: boolean; creditsSpent: number }
  | { ok: false; error: string };

const STYLE_HINTS: Record<string, string> = {
  photoreal: "Photorealistic, sharp detail, natural lighting, crisp surfaces.",
  cinematic: "Cinematic lighting, dramatic shadows, poster-quality depth.",
  anime: "Anime-inspired stylization, vibrant colors, clean lines.",
  "3d-render": "High-quality stylized 3D render, polished game-art finish.",
  pixel: "Pixel art, crisp edges, retro game aesthetic.",
  watercolor: "Soft watercolor painting, blended pigments, textured paper feel.",
  cyberpunk: "Cyberpunk neon, futuristic glow, high-contrast atmosphere.",
  minimalist: "Minimalist composition, restrained palette, clean focal hierarchy.",
  roblox: "Roblox-ready art direction, clickable composition, polished creator-market look.",
  logo: "Clean vector logo treatment, centered, bold and readable.",
};

export const generateImageStudio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data, context }): Promise<GenerateImageResult> => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    const isOwner = await isGeneratorOwner(userId, supabase);
    const creditsNeeded = data.variations * GENERATOR_CREDIT_COSTS.imagePerVariation;

    await ensureCreditsAvailable({ userId, amount: creditsNeeded, isOwner });

    // 1. Check if ComfyUI queue is active in settings
    const { data: settings } = await supabase
      .from("comfy_settings")
      .select("*")
      .eq("id", 1)
      .maybeSingle();

    if (settings?.use_local_comfy) {
      try {
        await spendCreditsAfterSuccess({
          supabase,
          userId,
          amount: creditsNeeded,
          isOwner,
          insufficientMessage: "Not enough credits to complete image generation.",
          reason: `image generation queue`,
        });
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : "Credits could not be deducted.",
        };
      }

      const jobPromises = Array.from({ length: data.variations }, (_, index) => {
        const variationPrompt = data.variations > 1
          ? `${data.prompt}\n\nCreate a distinct variation ${index + 1} with a fresh composition while keeping the same theme.`
          : data.prompt;

        return supabase
          .from("comfy_generation_jobs")
          .insert({
            user_id: userId,
            prompt: variationPrompt,
            negative_prompt: data.negativePrompt || "",
            type: "image",
            status: "pending",
            credits_cost: isOwner ? 0 : GENERATOR_CREDIT_COSTS.imagePerVariation,
            reference_image_url: data.referenceImageDataUrl || null,
            model: settings.model_choice,
            steps: settings.steps,
            cfg: settings.cfg,
            seed: settings.seed,
            width: settings.width,
            height: settings.height,
            aspect_ratio: data.aspectRatio,
          })
          .select("id")
          .single();
      });

      const createdJobs = await Promise.all(jobPromises);
      const jobIds = createdJobs.map((j) => j.data?.id).filter(Boolean) as string[];

      if (jobIds.length === 0) {
        // Refund if insertion failed
        await supabase.rpc("admin_adjust_credits", {
          _user_id: userId,
          _amount: isOwner ? 0 : creditsNeeded,
          _reason: `refund failed image jobs insertion`,
        });
        return { ok: false, error: "Failed to queue ComfyUI jobs." };
      }

      return {
        ok: true,
        jobIds,
        modelUsed: settings.model_choice,
        fellBack: false,
        creditsSpent: isOwner ? 0 : creditsNeeded,
      };
    }

    // 2. Fall back to existing direct Gemini generation code path
    const tasks = Array.from({ length: data.variations }, (_, index) =>
      generateStoredStudioImage({
        userId,
        model: data.model as StudioImageModel,
        quality: data.quality,
        aspectRatio: data.aspectRatio,
        negativePrompt: data.negativePrompt,
        styleHint: data.stylePreset ? STYLE_HINTS[data.stylePreset] : undefined,
        referenceImageDataUrl: data.referenceImageDataUrl,
        mode: "image",
        altText: data.prompt,
        prompt:
          data.variations > 1
            ? `${data.prompt}\n\nCreate a distinct variation ${index + 1} with a fresh composition while keeping the same theme.`
            : data.prompt,
      }),
    );

    try {
      const images = await Promise.all(tasks);
      await spendCreditsAfterSuccess({
        supabase,
        userId,
        amount: creditsNeeded,
        isOwner,
        insufficientMessage: "Not enough credits to complete image generation.",
        reason: `image generation: ${data.model}`,
      });

      return {
        ok: true,
        images: images.map((image) => ({ url: image.url, model: image.modelUsed })),
        modelUsed: images[0]?.modelUsed ?? data.model,
        fellBack: images.some((image) => image.fellBack),
        creditsSpent: isOwner ? 0 : creditsNeeded,
      };
    } catch (error) {
      return {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Image generation failed. Please try a faster model or simplify the prompt.",
      };
    }
  });

