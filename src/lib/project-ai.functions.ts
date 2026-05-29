import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const ProviderEnum = z.enum(["openai", "anthropic", "google", "groq", "neokens"]);

const SaveSettingsSchema = z.object({
  projectId: z.string().uuid(),
  mode: z.enum(["mcp", "api_key"]),
  provider: ProviderEnum.nullable().optional(),
  model: z.string().max(80).nullable().optional(),
});

const SaveKeySchema = z.object({
  provider: ProviderEnum,
  apiKey: z.string().min(8).max(400),
});

const ClearKeySchema = z.object({
  provider: ProviderEnum,
});

const GetSchema = z.object({
  projectId: z.string().uuid(),
});

async function assertProjectOwner(supabase: any, projectId: string, userId: string) {
  const { data: project, error } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !project) throw new Error("Project not found or unauthorized.");
}

export const getProjectAiConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => GetSchema.parse(input))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const { userId } = context;
    const { projectId } = data;
    await assertProjectOwner(supabase, projectId, userId);

    const [settingsRes, keysRes] = await Promise.all([
      supabase
        .from("project_ai_settings")
        .select("mode,provider,model,updated_at")
        .eq("project_id", projectId)
        .maybeSingle(),
      supabase.from("user_provider_keys").select("provider,label,updated_at").eq("user_id", userId),
    ]);

    const settings = settingsRes.data ?? {
      mode: "mcp",
      provider: null,
      model: null,
      updated_at: null,
    };
    const keys = (keysRes.data ?? []).reduce((acc: any, k: any) => {
      acc[k.provider] = { label: k.label, updatedAt: k.updated_at };
      return acc;
    }, {} as Record<string, { label: string | null; updatedAt: string }>);

    return { settings, keys };
  });

export const saveProjectAiSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SaveSettingsSchema.parse(input))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const { userId } = context;
    await assertProjectOwner(supabase, data.projectId, userId);
    const payload = {
      project_id: data.projectId,
      user_id: userId,
      mode: data.mode,
      provider: data.mode === "api_key" ? (data.provider ?? null) : null,
      model: data.mode === "api_key" ? (data.model ?? null) : null,
    };

    const { error } = await supabase
      .from("project_ai_settings")
      .upsert(payload, { onConflict: "project_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const saveProviderKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SaveKeySchema.parse(input))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const { userId } = context;
    const { error } = await supabase.from("user_provider_keys").upsert(
      {
        user_id: userId,
        provider: data.provider,
        api_key: data.apiKey.trim(),
        label: null,
      },
      { onConflict: "user_id,provider" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const clearProviderKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ClearKeySchema.parse(input))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const { userId } = context;
    const { error } = await supabase
      .from("user_provider_keys")
      .delete()
      .eq("user_id", userId)
      .eq("provider", data.provider);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
