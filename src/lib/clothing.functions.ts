import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

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
      imageUrl: string;
      kind: GenerateClothingInput["kind"];
      isClassic: boolean;
      uploadTip: string;
    }
  | { ok: false; error: string };

// Cost in credits for one clothing texture generation.
const CLOTHING_CREDIT_COST = 2;

/**
 * Generate a Roblox clothing texture/graphic via the Gemini image pipeline.
 * Credits are charged up-front (atomic) and REFUNDED if generation fails, so a
 * failed generation never costs the user credits.
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

    // Owners/admins generate free.
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const isOwner = (roles ?? []).some(
      (r: { role: string }) => r.role === "owner" || r.role === "admin",
    );

    // Hourly safety cap (fails open) — checked before charging.
    const limitErr = await checkImageHourlyLimit(userId);
    if (limitErr) return { ok: false, error: limitErr };

    // Charge up-front, refund on any failure below.
    if (!isOwner) {
      const { error: spendErr } = await supabase.rpc("spend_credits_atomic", {
        _amount: CLOTHING_CREDIT_COST,
      });
      if (spendErr) {
        return { ok: false, error: "Not enough credits. Buy more on the Pricing page." };
      }
    }
    const refund = async (reason: string) => {
      if (isOwner) return;
      try {
        await supabase.rpc("refund_credits", {
          _amount: CLOTHING_CREDIT_COST,
          _reason: reason,
        });
      } catch {
        // best-effort refund; never throw from the refund path
      }
    };

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

    const prompt = buildClothingImagePrompt(data.kind, data.style);

    const result = await generateImageFromPrompt({
      userId,
      prompt,
      aspectRatio: "1:1",
      referenceImageBase64,
      referenceMime,
      altText: `${data.kind.replace(/_/g, " ")}: ${data.style}`,
    });

    if ("error" in result) {
      await refund("clothing generation failed");
      return { ok: false, error: `${result.error} (No credits were charged.)` };
    }

    const isClassic = data.kind === "classic_shirt" || data.kind === "classic_pants";
    const uploadTip = isClassic
      ? `Download the PNG, then in the Roblox Creator Dashboard go to Create → Avatar Items → Classic Clothing and upload it as a ${
          data.kind === "classic_shirt" ? "Shirt" : "Pants"
        }. Roblox wraps the template onto the avatar automatically. Classic clothing uploads require a verified account/group and cost ~R$10.`
      : data.kind === "tshirt"
        ? "Download the PNG and upload it as a Classic T-Shirt (Create → Avatar Items → Classic T-Shirt). It shows flat on the torso front."
        : "This is DESIGN ART for a 3D accessory, not a ready mesh. Model the shape in Blender (or import a base mesh), bring it into Studio via Avatar → Accessory Fitting Tool, set the correct Attachment (Hat → HatAttachment, back items → BodyBackAttachment, etc.), apply this art as its texture, then publish as an Accessory.";

    return {
      ok: true,
      imageUrl: result.imageUrl,
      kind: data.kind,
      isClassic,
      uploadTip,
    };
  });
