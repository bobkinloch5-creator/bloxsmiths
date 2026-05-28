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

/**
 * Generate a Roblox clothing texture/graphic. Reuses the same Gemini-backed
 * pipeline the AI chat uses via the `generate_clothing` tool, so the
 * dedicated /clothing studio and the in-chat tool produce identical assets.
 */
export const generateClothing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data, context }): Promise<GenerateClothingResult> => {
    const { userId } = context as { userId: string };

    const { checkImageHourlyLimit, generateImageFromPrompt } = await import(
      "./image-gen.server"
    );
    const { buildClothingImagePrompt } = await import("./roblox-clothing");

    const limitErr = await checkImageHourlyLimit(userId);
    if (limitErr) return { ok: false, error: limitErr };

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
    if ("error" in result) return { ok: false, error: result.error };

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
      imageUrl: result.url,
      kind: data.kind,
      isClassic,
      uploadTip,
    };
  });
