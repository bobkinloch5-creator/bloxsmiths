import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PublishInput = z.object({
  projectId: z.string().uuid(),
  universeId: z.string().min(1).max(32).regex(/^\d+$/, "Universe ID must be numeric"),
  placeId: z.string().min(1).max(32).regex(/^\d+$/, "Place ID must be numeric"),
  versionType: z.enum(["Published", "Saved"]).default("Published"),
});

const SaveIdsInput = z.object({
  projectId: z.string().uuid(),
  universeId: z.string().max(32).regex(/^\d*$/).nullable(),
  placeId: z.string().max(32).regex(/^\d*$/).nullable(),
});

/** Save the Roblox universe + place IDs onto the project (owner only). */
export const saveRobloxIds = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SaveIdsInput.parse(d))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const { userId } = context;
    const { data: proj } = await supabase
      .from("projects")
      .select("user_id")
      .eq("id", data.projectId)
      .maybeSingle();
    if (!proj || proj.user_id !== userId) throw new Error("Forbidden");
    const { error } = await supabase
      .from("projects")
      .update({
        roblox_universe_id: data.universeId || null,
        roblox_place_id: data.placeId || null,
      })
      .eq("id", data.projectId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** One-click publish: build .rbxlx server-side and upload via Open Cloud. */
export const publishToRoblox = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => PublishInput.parse(d))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const { userId } = context;
    const apiKey = process.env.ROBLOX_OPEN_CLOUD_API_KEY;
    if (!apiKey) {
      throw new Error(
        "Roblox publishing is not configured on the server. Ask the workspace owner to add ROBLOX_OPEN_CLOUD_API_KEY.",
      );
    }

    const { data: proj } = await supabase
      .from("projects")
      .select("id,name,user_id")
      .eq("id", data.projectId)
      .maybeSingle();
    if (!proj) throw new Error("Project not found");
    if (proj.user_id !== userId) throw new Error("Only the project owner can publish to Roblox.");

    const { data: files } = await supabase
      .from("project_files")
      .select("path,file_type,service_location,content")
      .eq("project_id", data.projectId);

    if (!files || files.length === 0) {
      throw new Error("No project files to publish. Generate some scripts first.");
    }

    const { buildRbxlx } = await import("./roblox-place.server");
    const xml = buildRbxlx(proj.name || "BloxSmithGame", files as any);
    const body = new TextEncoder().encode(xml);

    const url = `https://apis.roblox.com/universes/v1/${data.universeId}/places/${data.placeId}/versions?versionType=${data.versionType}`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/octet-stream",
      },
      body,
    });

    const text = await res.text();
    if (!res.ok) {
      // Most common: 401 (bad key), 403 (key lacks place:write scope or wrong universe), 404 (bad ids).
      let hint = "";
      if (res.status === 401) hint = " Check that ROBLOX_OPEN_CLOUD_API_KEY is valid.";
      else if (res.status === 403)
        hint = " Your API key must include the `universe-places:write` scope for this universe.";
      else if (res.status === 404) hint = " Double-check the Universe ID and Place ID.";
      throw new Error(`Roblox publish failed (${res.status}): ${text}${hint}`);
    }

    let versionNumber: number | null = null;
    try {
      const parsed = JSON.parse(text);
      versionNumber = parsed.versionNumber ?? null;
    } catch {
      /* ignore */
    }

    await supabase
      .from("projects")
      .update({
        roblox_universe_id: data.universeId,
        roblox_place_id: data.placeId,
        roblox_last_published_at: new Date().toISOString(),
        roblox_last_version: versionNumber,
      })
      .eq("id", data.projectId);

    return {
      ok: true,
      versionNumber,
      placeUrl: `https://www.roblox.com/games/${data.placeId}`,
      filesUploaded: files.length,
    };
  });
