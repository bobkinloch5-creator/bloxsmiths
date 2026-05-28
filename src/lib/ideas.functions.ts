import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const CATEGORIES = [
  "Simulator",
  "Tycoon",
  "Obby",
  "Horror",
  "Fighting",
  "Roleplay",
  "Anime",
  "Survival",
  "Racing",
  "Minigames",
  "Tower Defense",
] as const;

export const generateGameIdeas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        category: z.enum(CATEGORIES).optional(),
        count: z.number().min(1).max(5).default(3),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const isOwner = (roles ?? []).some((r) => r.role === "owner" || r.role === "admin");
    const COST = 1;
    if (!isOwner) {
      const { error } = await supabase.rpc("spend_credits_atomic", { _amount: COST });
      if (error) throw new Error("Not enough credits to brainstorm ideas.");
    }

    const { generateText } = await import("ai");
    const { resolveBuiltInGateway } = await import("./ai-providers.server");
    let model;
    try {
      model = resolveBuiltInGateway({ kind: "fast" }).model;
    } catch (e) {
      if (!isOwner) await supabase.rpc("refund_credits", { _amount: COST, _reason: "no ai key" });
      throw e;
    }

    const catLine = data.category ? `Category: ${data.category}.` : "Any popular Roblox category.";
    const system = `You are a Roblox game-idea generator. Output ${data.count} fresh, ORIGINAL ideas that real players would actually play. Keep every field concise. Strictly return JSON only (no markdown), shaped:
{"ideas":[{"name":"...","category":"...","loop":"...","features":["...","..."],"monetization":["...","..."],"difficulty":"beginner|intermediate|advanced","build_prompt":"..."}]}
"build_prompt" must be one executable sentence. Use exactly 3 short features and 2 short monetization ideas per idea.`;

    let text = "";
    try {
      const out = await generateText({ model, system, prompt: catLine, maxOutputTokens: 1400 });
      text = out.text;
    } catch (err) {
      if (!isOwner)
        await supabase.rpc("refund_credits", { _amount: COST, _reason: "ideas failed" });
      throw new Error("Idea generation failed: " + String((err as Error).message));
    }

    // Robust JSON extraction
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return { ideas: [] };
    try {
      const parsed = JSON.parse(match[0]);
      return { ideas: parsed.ideas ?? [] };
    } catch {
      return { ideas: [] };
    }
  });

export const IDEA_CATEGORIES = CATEGORIES;
