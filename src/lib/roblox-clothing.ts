// Roblox clothing & accessory domain knowledge.
//
// This encodes the *real* Roblox rules so the AI gives accurate, non-misleading
// guidance. The single most important truth here: text-to-image models produce
// 2D TEXTURE art, not 3D meshes. Classic shirts/pants ARE 2D textures, so they
// can be generated end-to-end. Layered clothing and 3D accessories (hats,
// wings, backpacks) are MESHES — we generate concept/texture art + a build
// spec, never a fake mesh.

export type ClothingKind = "classic_shirt" | "classic_pants" | "tshirt" | "layered_or_accessory";

// Official Roblox classic clothing template dimensions (the flat UV layout the
// avatar maps onto). Users paint inside these regions.
export const ROBLOX_CLASSIC_TEMPLATE = {
  width: 585,
  height: 559,
  note: "Roblox classic shirt/pants template is 585×559 px. The avatar wraps this flat texture onto the body — front, back, sides, arms/legs are laid out as connected panels.",
};

// T-shirts are just square decals shown on the torso front.
export const ROBLOX_TSHIRT = {
  recommended: "512x512",
  note: "A classic T-Shirt is a single square image (Decal) displayed flat on the torso front — NOT wrapped like a shirt. 512×512 is a good size.",
};

export const CLOTHING_KNOWLEDGE_PROMPT = `
## Roblox Clothing & Accessory Studio (how BloxSmith makes wearables)

You can help users create Roblox wearables. Be ACCURATE about what is a texture vs a mesh — never imply you produced a 3D mesh when you generated a 2D image.

### The core distinction (state this honestly when relevant)
- **Classic Shirt / Pants** = a single flat 2D TEXTURE (PNG) wrapped onto the avatar via Roblox's 585×559 template. You CAN generate these end-to-end with generate_clothing — the output PNG is upload-ready.
- **Classic T-Shirt** = a square Decal shown flat on the torso front (not wrapped). Also a 2D image you can generate.
- **Layered Clothing** (modern draping hoodies/jackets/dresses) and **3D Accessories** (hats, glasses, masks, backpacks, chains, wings, hair, shoulder items) = 3D MESHES. These require mesh modeling in Blender + Studio's Avatar Setup. You do NOT generate meshes. For these, generate concept/texture art + a clear build spec, and guide the user.

### When the user asks for a shirt / pants / uniform / classic outfit
1. Call generate_clothing with kind "classic_shirt" or "classic_pants" and a rich style description.
2. The tool returns a texture laid out for the Roblox template. Show it inline.
3. Tell them the upload path: Create → Avatar Items → Classic Clothing in the Creator Dashboard (or Studio Asset Manager), upload the PNG, and Roblox applies the template wrap. Mention the ~R$10 upload fee Roblox charges and that classic clothing requires a verified account / group.

### When the user asks for a hoodie / jacket / layered item / any accessory
1. Be upfront in ONE friendly sentence: these are 3D items, so you'll generate the design art + a build spec rather than a ready mesh.
2. Call generate_clothing with kind "tshirt" (for a wearable graphic) or use generate_image for pure concept art, AND give a build spec: silhouette, key shapes, attachment point (e.g. Hat → Head, Back accessory → use a Back attachment), recommended scale, and texture notes.
3. Point them to the real path: model in Blender (or buy/commission a base mesh), import via Studio → Avatar → Accessory Fitting Tool, set the Attachment, then publish as an Accessory. Offer to generate the texture/decal for that mesh.

### Outfit sets & ideas
- For "full outfit" / "clothing set" requests, generate the shirt AND pants as two coordinated textures, plus an accessory build spec to complete the look. Keep a consistent palette and theme across pieces.
- For "outfit ideas" (no generation), give 3-5 concrete themed concepts with palettes and the catalog items or generatable pieces that achieve each.

### Quality bar for generated clothing textures
- Bold, readable, game-appropriate; avoid tiny detail that blurs when wrapped on the low-res avatar.
- Respect the body layout: design for front torso, back, and sleeves as connected regions — not a single centered logo unless it's a T-Shirt.
- Honor the user's colors/theme exactly. "black and red cyber hoodie" = dark base, red accents, techwear/cyber motifs.
- Never produce real-world brand logos, copyrighted characters, or another creator's art. Original designs only.

### Safety
- Decline requests for clothing that depicts real brand IP, hateful/explicit imagery, or impersonates Roblox's own moderation/staff items.
`;

/**
 * Build the Gemini prompt for a clothing texture, given the kind and the user's
 * style description. For classic shirt/pants we instruct a template-style flat
 * layout; for t-shirt we instruct a centered square graphic.
 */
export function buildClothingImagePrompt(kind: ClothingKind, style: string): string {
  const cleanStyle = style.trim().slice(0, 900);
  if (kind === "classic_shirt") {
    return `A Roblox CLASSIC SHIRT texture template, flat 2D UV layout (585x559 proportions). Lay out connected panels for the torso FRONT, torso BACK, and both ARM sleeves as they appear on a Roblox classic clothing template — flat, no 3D perspective, no avatar body, no mannequin. Fill every panel so no blank avatar skin shows through. Bold, clean, game-ready. Design theme: ${cleanStyle}. Original artwork only — no real-world brands or copyrighted characters.`;
  }
  if (kind === "classic_pants") {
    return `A Roblox CLASSIC PANTS texture template, flat 2D UV layout (585x559 proportions). Lay out connected panels for both LEG fronts, LEG backs, and the hip/waist as on a Roblox classic pants template — flat, no 3D perspective, no avatar, no mannequin. Fill every panel fully. Bold, clean, game-ready. Design theme: ${cleanStyle}. Original artwork only — no real-world brands or copyrighted characters.`;
  }
  // tshirt / layered-as-graphic
  return `A Roblox T-SHIRT graphic: a single bold, centered square design on a clean background, meant to be shown flat on an avatar's torso front. No 3D, no mannequin. Design theme: ${cleanStyle}. Original artwork only — no real-world brands or copyrighted characters.`;
}
