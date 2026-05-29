import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { isGeneratorOwner, spendCreditsAfterSuccess } from "./generator-credits.server";
import { logUserActivity } from "@/lib/activity.functions";

const InputSchema = z.object({
  kind: z.enum(["classic_shirt", "classic_pants", "tshirt", "layered_or_accessory"]),
  style: z.string().min(3).max(900),
  referenceImageDataUrl: z
    .string()
    .regex(/^data:image\/(png|jpeg|jpg|webp);base64,/, "Must be a data:image base64 URL")
    .max(8_000_000)
    .optional(),
});

export type GenerateClothingInput = z.infer<typeof InputSchema>;

export type GenerateClothingResult =
  | {
      ok: true;
      imageUrl?: string;
      jobId?: string;
      kind: GenerateClothingInput["kind"];
      isClassic: boolean;
      uploadTip: string;
      creditsSpent: number;
    }
  | { ok: false; error: string };

// Cost in credits for one clothing texture generation.
const CLOTHING_CREDIT_COST = 2;

/**
 * Generate a Roblox clothing texture/graphic via the image pipeline.
 * Users are charged only after a successful result. If the credit RPC is not
 * installed yet, the fallback updater still deducts credits from profiles.
 */
export const generateClothing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data, context }): Promise<GenerateClothingResult> => {
    const { userId, supabase } = context as {
      userId: string;
      supabase: import("@supabase/supabase-js").SupabaseClient;
    };

    const { checkImageHourlyLimit, generateImageFromPrompt } = await import("./image-gen.server");
    const { buildClothingImagePrompt } = await import("./roblox-clothing");

    const isOwner = await isGeneratorOwner(userId, supabase);

    // Hourly safety cap (fails open) — checked before generation.
    const limitErr = await checkImageHourlyLimit(userId);
    if (limitErr) return { ok: false, error: limitErr };

    const prompt = buildClothingImagePrompt(data.kind, data.style);

    // 1. Check if ComfyUI queue is active in settings
    const { data: settings } = await supabase
      .from("comfy_settings")
      .select("*")
      .eq("id", 1)
      .maybeSingle();

    const isClassic = data.kind === "classic_shirt" || data.kind === "classic_pants";
    const uploadTip = isClassic
      ? `Download the PNG, then in the Roblox Creator Dashboard go to Create → Avatar Items → Classic Clothing and upload it as a ${
          data.kind === "classic_shirt" ? "Shirt" : "Pants"
        }. Roblox wraps the template onto the avatar automatically. Classic clothing uploads require a verified account/group and cost ~R$10.`
      : data.kind === "tshirt"
        ? "Download the PNG and upload it as a Classic T-Shirt (Create → Avatar Items → Classic T-Shirt). It shows flat on the torso front."
        : "This is DESIGN ART for a 3D accessory, not a ready mesh. Model the shape in Blender (or import a base mesh), bring it into Studio via Avatar → Accessory Fitting Tool, set the correct Attachment (Hat → HatAttachment, back items → BodyBackAttachment, etc.), apply this art as its texture, then publish as an Accessory.";

    if (settings?.use_local_comfy) {
      try {
        // Spend credits upfront for async jobs (trigger refunds if failed)
        await spendCreditsAfterSuccess({
          supabase,
          userId,
          amount: CLOTHING_CREDIT_COST,
          isOwner,
          insufficientMessage: "Not enough credits to complete clothing generation.",
          reason: `clothing generation queue: ${data.kind}`,
        });
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : "Credits could not be deducted.",
        };
      }

      // Insert job in comfy queue
      const { data: job, error: jobErr } = await supabase
        .from("comfy_generation_jobs")
        .insert({
          user_id: userId,
          prompt,
          negative_prompt: "",
          type: data.kind,
          status: "pending",
          credits_cost: isOwner ? 0 : CLOTHING_CREDIT_COST,
          reference_image_url: data.referenceImageDataUrl || null,
          model: settings.model_choice,
          steps: settings.steps,
          cfg: settings.cfg,
          seed: settings.seed,
          width: settings.width,
          height: settings.height,
        })
        .select()
        .single();

      if (jobErr) {
        // Refund if insertion failed
        await supabase.rpc("admin_adjust_credits", {
          _user_id: userId,
          _amount: isOwner ? 0 : CLOTHING_CREDIT_COST,
          _reason: `refund failed job insertion: ${jobErr.message}`,
        });
        return { ok: false, error: `Failed to queue job: ${jobErr.message}` };
      }

      void logUserActivity({
        eventType: "clothing_queued",
        description: `Queued local comfy clothing generation: ${data.kind} (${data.style.slice(0, 50)})`,
        userId,
      }).catch(err => console.error("Error logging clothing_queued activity:", err));

      return {
        ok: true,
        jobId: job.id,
        kind: data.kind,
        isClassic,
        uploadTip,
        creditsSpent: isOwner ? 0 : CLOTHING_CREDIT_COST,
      };
    }

    // 2. Fall back to existing direct Gemini generation code path
    let referenceImageBase64: string | undefined;
    let referenceMime: string | undefined;
    const ref = data.referenceImageDataUrl;
    if (ref) {
      const comma = ref.indexOf(",");
      if (comma > 0) {
        referenceMime = ref.slice(5, ref.indexOf(";"));
        referenceImageBase64 = ref.slice(comma + 1);
      }
    }

    const result = await generateImageFromPrompt({
      userId,
      prompt,
      aspectRatio: "1:1",
      referenceImageBase64,
      referenceMime,
      altText: `${data.kind.replace(/_/g, " ")}: ${data.style}`,
    });

    if ("error" in result) {
      return { ok: false, error: `${result.error} (No credits were charged.)` };
    }

    try {
      await spendCreditsAfterSuccess({
        supabase,
        userId,
        amount: CLOTHING_CREDIT_COST,
        isOwner,
        insufficientMessage: "Not enough credits to complete clothing generation.",
        reason: `clothing generation: ${data.kind}`,
      });
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Credits could not be deducted.",
      };
    }

    void logUserActivity({
      eventType: "clothing_success",
      description: `Generated clothing texture: ${data.kind} (${data.style.slice(0, 50)})`,
      userId,
    }).catch(err => console.error("Error logging clothing_success activity:", err));

    return {
      ok: true,
      imageUrl: result.imageUrl,
      kind: data.kind,
      isClassic,
      uploadTip,
      creditsSpent: isOwner ? 0 : CLOTHING_CREDIT_COST,
    };
  });

