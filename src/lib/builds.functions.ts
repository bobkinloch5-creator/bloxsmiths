import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------------------------------------------------------------------------
// Build History — aggregated view of every AI batch that produced files or
// actions across all conversations in a project. Powers the History drawer.
// ---------------------------------------------------------------------------
export type BuildSnapshotEntry = { path: string; existed: boolean };

export type BuildHistoryItem = {
  id: string;
  conversation_id: string;
  conversation_title: string | null;
  created_at: string;
  preview: string;
  files: number;
  actions: number;
  generationId: string | null;
  reverted: boolean;
  snapshotCount: number;
  dangerCount: number;
  creditsUsed: number | null;
  snapshotPaths: BuildSnapshotEntry[];
};

export const getBuildHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({ projectId: z.string().uuid(), limit: z.number().int().min(1).max(200).default(50) })
      .parse(i),
  )
  .handler(async ({ data, context }): Promise<{ items: BuildHistoryItem[] }> => {
    const { supabase, userId } = context;
    const { projectId, limit } = data;

    const { data: project } = await supabase
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!project) throw new Error("Project not found or unauthorized.");

    // Conversations for this user's private project chat.
    const { data: convos, error: cErr } = await supabase
      .from("agent_conversations")
      .select("id,title")
      .eq("project_id", projectId)
      .eq("user_id", userId);
    if (cErr) throw new Error(cErr.message);
    if (!convos || convos.length === 0) return { items: [] };

    const convoMap = new Map(convos.map((c) => [c.id, c.title]));
    const ids = convos.map((c) => c.id);

    const { data: msgs, error: mErr } = await supabase
      .from("agent_messages")
      .select("id,conversation_id,content,actions,created_at")
      .in("conversation_id", ids)
      .eq("role", "assistant")
      .order("created_at", { ascending: false })
      .limit(limit * 2);
    if (mErr) throw new Error(mErr.message);

    const items: BuildHistoryItem[] = [];
    for (const m of msgs ?? []) {
      const a: any = m.actions ?? {};
      const files = typeof a.files === "number" ? a.files : 0;
      const actions = typeof a.actions === "number" ? a.actions : 0;
      if (files === 0 && actions === 0) continue;
      const snap: any[] = Array.isArray(a.snapshot) ? a.snapshot : [];
      items.push({
        id: m.id,
        conversation_id: m.conversation_id,
        conversation_title: convoMap.get(m.conversation_id) ?? null,
        created_at: m.created_at,
        preview: (m.content || "").replace(/\s+/g, " ").slice(0, 140),
        files,
        actions,
        generationId: a.generationId ?? null,
        reverted: a.reverted === true,
        snapshotCount: snap.length,
        dangerCount: Array.isArray(a.dangers) ? a.dangers.length : 0,
        creditsUsed: null,
        snapshotPaths: snap
          .filter((s) => s && typeof s.path === "string")
          .map((s) => ({ path: s.path as string, existed: s.existed === true })),
      });
      if (items.length >= limit) break;
    }

    // Hydrate creditsUsed from generations table (single batch query).
    const genIds = items.map((it) => it.generationId).filter((x): x is string => !!x);
    if (genIds.length > 0) {
      const { data: gens } = await supabase
        .from("generations")
        .select("id,credits_used")
        .in("id", genIds);
      if (gens) {
        const costMap = new Map(gens.map((g) => [g.id, g.credits_used]));
        for (const it of items) {
          if (it.generationId && costMap.has(it.generationId)) {
            it.creditsUsed = costMap.get(it.generationId) ?? null;
          }
        }
      }
    }

    return { items };
  });

// ---------------------------------------------------------------------------
// Smart Folder Organizer — queues plugin actions that create the standard
// Roblox service folder layout so beginner projects look professional.
// ---------------------------------------------------------------------------
const STANDARD_LAYOUT: { parent: string; name: string }[] = [
  { parent: "ReplicatedStorage", name: "Remotes" },
  { parent: "ReplicatedStorage", name: "Modules" },
  { parent: "ReplicatedStorage", name: "Assets" },
  { parent: "ReplicatedStorage", name: "Shared" },
  { parent: "ServerScriptService", name: "Systems" },
  { parent: "ServerScriptService", name: "Services" },
  { parent: "ServerScriptService", name: "Modules" },
  { parent: "ServerStorage", name: "Modules" },
  { parent: "ServerStorage", name: "Assets" },
  { parent: "StarterGui", name: "MainUI" },
  { parent: "StarterGui", name: "ShopUI" },
  { parent: "StarterGui", name: "InventoryUI" },
  { parent: "StarterPlayer/StarterPlayerScripts", name: "Client" },
  { parent: "StarterPlayer/StarterCharacterScripts", name: "Character" },
  { parent: "Workspace", name: "Map" },
  { parent: "Workspace", name: "Interactables" },
  { parent: "Workspace", name: "NPCs" },
  { parent: "Workspace", name: "Spawns" },
];

export const organizeProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ projectId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { projectId } = data;

    // Owner check via RLS-friendly read.
    const { data: proj, error: pErr } = await supabase
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .eq("user_id", userId)
      .maybeSingle();
    if (pErr || !proj) throw new Error("Project not found or not accessible.");

    const rows = STANDARD_LAYOUT.map((f) => ({
      project_id: projectId,
      user_id: userId,
      action_type: "create",
      payload: {
        type: "create",
        className: "Folder",
        parent: f.parent,
        name: f.name,
        organizer: true,
      },
      status: "pending",
    }));

    const { error } = await supabase.from("plugin_actions").insert(rows);
    if (error) throw new Error(error.message);

    return { queued: rows.length, layout: STANDARD_LAYOUT };
  });

// ---------------------------------------------------------------------------
// Revert Build — restores file snapshot from a specific assistant message and
// queues Studio deletes for files that didn't exist before. Also marks the
// message's actions.reverted = true so the History drawer dims it.
// ---------------------------------------------------------------------------
export const revertBuild = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ projectId: z.string().uuid(), messageId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { projectId, messageId } = data;

    // Owner check via RLS-friendly read.
    const { data: proj, error: pErr } = await supabase
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .eq("user_id", userId)
      .maybeSingle();
    if (pErr || !proj) throw new Error("Project not found or not accessible.");

    const { data: msg, error: mErr } = await supabase
      .from("agent_messages")
      .select("id,actions,conversation_id")
      .eq("id", messageId)
      .maybeSingle();
    if (mErr || !msg) throw new Error("Build not found.");

    const actions: any = msg.actions ?? {};
    if (actions.reverted === true) {
      return { restored: 0, removed: 0, queuedDeletes: 0, alreadyReverted: true };
    }
    const snap: any[] = Array.isArray(actions.snapshot) ? actions.snapshot : [];
    if (snap.length === 0) throw new Error("No snapshot stored for this build.");

    // Pull current file ids for this project so we can update/delete by id.
    const { data: cur } = await supabase
      .from("project_files")
      .select("id,path,file_type,service_location")
      .eq("project_id", projectId);
    const byPath = new Map((cur ?? []).map((f) => [f.path, f]));

    let restored = 0;
    let removed = 0;
    const queueDeletes: string[] = [];

    for (const s of snap) {
      if (!s || typeof s.path !== "string") continue;
      const existing = byPath.get(s.path);
      if (s.existed) {
        if (existing) {
          await supabase
            .from("project_files")
            .update({
              content: s.content ?? "",
              file_type: s.file_type ?? existing.file_type,
              service_location: s.service_location ?? existing.service_location,
            })
            .eq("id", existing.id);
          restored++;
        }
      } else {
        if (existing) {
          await supabase.from("project_files").delete().eq("id", existing.id);
        }
        queueDeletes.push(s.path);
        removed++;
      }
    }

    // Queue Studio deletes for files that didn't exist before this build.
    if (queueDeletes.length > 0) {
      const rows = queueDeletes.map((path) => ({
        project_id: projectId,
        user_id: userId,
        action_type: "delete",
        payload: { type: "delete", path },
        status: "pending",
      }));
      await supabase.from("plugin_actions").insert(rows);
    }

    // Mark message as reverted.
    await supabase
      .from("agent_messages")
      .update({ actions: { ...actions, reverted: true } })
      .eq("id", messageId);

    return { restored, removed, queuedDeletes: queueDeletes.length, alreadyReverted: false };
  });

// ---------------------------------------------------------------------------
// Build Diff — returns before/after content for every file changed in a
// specific assistant build. Powers the "View diff" expansion in the History
// drawer. `before` is from the snapshot stored at build time; `after` is the
// current content in project_files (or null if deleted/reverted).
// ---------------------------------------------------------------------------
export type BuildDiffFile = {
  path: string;
  existed: boolean;
  before: string | null;
  after: string | null;
  beforeLines: number;
  afterLines: number;
  added: number;
  removed: number;
};

export const getBuildDiff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ projectId: z.string().uuid(), messageId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }): Promise<{ files: BuildDiffFile[] }> => {
    const { supabase, userId } = context;

    const { data: project } = await supabase
      .from("projects")
      .select("id")
      .eq("id", data.projectId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!project) throw new Error("Project not found or unauthorized.");

    const { data: msg, error: mErr } = await supabase
      .from("agent_messages")
      .select("id,actions")
      .eq("id", data.messageId)
      .maybeSingle();
    if (mErr || !msg) throw new Error("Build not found.");
    const actions: any = msg.actions ?? {};
    const snap: any[] = Array.isArray(actions.snapshot) ? actions.snapshot : [];
    if (snap.length === 0) return { files: [] };

    const paths = snap.map((s) => s?.path).filter((p): p is string => typeof p === "string");
    const { data: cur } = await supabase
      .from("project_files")
      .select("path,content")
      .eq("project_id", data.projectId)
      .in("path", paths);
    const afterMap = new Map((cur ?? []).map((f) => [f.path, f.content ?? ""]));

    const files: BuildDiffFile[] = snap
      .filter((s) => s && typeof s.path === "string")
      .map((s) => {
        const before: string | null = s.existed
          ? typeof s.content === "string"
            ? s.content
            : ""
          : null;
        const after: string | null = afterMap.has(s.path) ? afterMap.get(s.path)! : null;
        const beforeLines = before == null ? 0 : before.split("\n").length;
        const afterLines = after == null ? 0 : after.split("\n").length;
        // Cheap line-set diff — good enough for "what changed" overview.
        const beforeSet = new Set((before ?? "").split("\n"));
        const afterSet = new Set((after ?? "").split("\n"));
        let added = 0;
        let removed = 0;
        afterSet.forEach((l) => {
          if (!beforeSet.has(l)) added++;
        });
        beforeSet.forEach((l) => {
          if (!afterSet.has(l)) removed++;
        });
        return {
          path: s.path,
          existed: s.existed === true,
          before,
          after,
          beforeLines,
          afterLines,
          added,
          removed,
        };
      });

    return { files };
  });
