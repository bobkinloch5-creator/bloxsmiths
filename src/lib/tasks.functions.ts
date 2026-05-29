import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------------------------------------------------------------------------
// Task workflow — Plan → Build → Insert → Test → Fix loop.
// Backed by the existing public.project_tasks table.
// Status values used by the board UI:
//   planned | in_progress | needs_testing | needs_fix | done | skipped
// (Legacy rows may use "todo" — the board treats "todo" as "planned".)
// ---------------------------------------------------------------------------

export type WorkflowTask = {
  id: string;
  project_id: string;
  title: string;
  kind: string;
  status: string;
  position: number;
  payload: any;
  created_at: string;
  updated_at: string;
};

export const listTasks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ projectId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }): Promise<{ tasks: WorkflowTask[] }> => {
    const supabase = context.supabase as any;
    const { data: rows, error } = await supabase
      .from("project_tasks")
      .select("*")
      .eq("project_id", data.projectId)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return { tasks: (rows ?? []) as WorkflowTask[] };
  });

export const setTaskStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        taskId: z.string().uuid(),
        status: z.enum([
          "planned",
          "in_progress",
          "needs_testing",
          "needs_fix",
          "done",
          "skipped",
          "todo",
        ]),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const { error } = await supabase
      .from("project_tasks")
      .update({ status: data.status, updated_at: new Date().toISOString() })
      .eq("id", data.taskId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ taskId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const { error } = await supabase.from("project_tasks").delete().eq("id", data.taskId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const addTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        title: z.string().min(1).max(200),
        kind: z.string().default("feature"),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const { userId } = context;
    const { data: maxPos } = await supabase
      .from("project_tasks")
      .select("position")
      .eq("project_id", data.projectId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    const next = (maxPos?.position ?? -1) + 1;
    const { data: row, error } = await supabase
      .from("project_tasks")
      .insert({
        project_id: data.projectId,
        user_id: userId,
        title: data.title,
        kind: data.kind,
        status: "planned",
        position: next,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { task: row as WorkflowTask };
  });

// ---------------------------------------------------------------------------
// planFromPrompt — AI breaks a high-level request (e.g. "make a mining
// simulator") into an ordered list of build tasks and persists them as
// "planned" tasks on the board.
// ---------------------------------------------------------------------------
export const planFromPrompt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        prompt: z.string().min(3).max(2000),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const { userId } = context;
    const COST = 1;

    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    const isOwner = (roles ?? []).some((r: any) => r.role === "owner" || r.role === "admin");
    if (!isOwner) {
      const { error } = await supabase.rpc("spend_credits_atomic", { _amount: COST });
      if (error) throw new Error("Not enough credits to plan tasks.");
    }

    // Pull existing tasks so we don't duplicate planned work.
    const { data: existing } = await supabase
      .from("project_tasks")
      .select("title,status")
      .eq("project_id", data.projectId)
      .neq("status", "done")
      .neq("status", "skipped");
    const existingTitles = (existing ?? []).map((r: any) => r.title.toLowerCase());

    const { generateText } = await import("ai");
    const { resolveBuiltInGateway } = await import("./ai-providers.server");
    let model;
    try {
      model = resolveBuiltInGateway({ kind: "fast" }).model;
    } catch (e) {
      if (!isOwner) await supabase.rpc("refund_credits", { _amount: COST, _reason: "no ai key" });
      throw e;
    }

    const system = `You are a Roblox project manager. Break the user's request into 6-14 ordered, atomic build tasks. Each task should be one buildable system or feature (e.g. "Create leaderstats", "Add coin pickup system", "Build sell zone", "Wire DataStore saving"). Return STRICT JSON only:
{"tasks":[{"title":"...","kind":"feature|system|ui|data|polish"}]}
Keep titles under 60 chars, verb-led. Do NOT include the original request as a task. Skip anything already in the existing-tasks list.`;

    const userPrompt = `Request: ${data.prompt}\n\nExisting tasks (do not duplicate): ${existingTitles.join(" | ") || "(none)"}`;

    let text = "";
    try {
      const out = await generateText({ model, system, prompt: userPrompt });
      text = out.text;
    } catch (err) {
      if (!isOwner) await supabase.rpc("refund_credits", { _amount: COST, _reason: "plan failed" });
      throw new Error("Plan generation failed: " + String((err as Error).message));
    }

    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return { tasks: [], created: 0 };
    let parsed: { tasks?: Array<{ title?: string; kind?: string }> };
    try {
      parsed = JSON.parse(match[0]);
    } catch {
      return { tasks: [], created: 0 };
    }
    const incoming = (parsed.tasks ?? [])
      .filter((t) => t.title && t.title.trim().length > 0)
      .filter((t) => !existingTitles.includes(t.title!.trim().toLowerCase()))
      .slice(0, 14);

    if (incoming.length === 0) return { tasks: [], created: 0 };

    const { data: maxPos } = await supabase
      .from("project_tasks")
      .select("position")
      .eq("project_id", data.projectId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    const base = (maxPos?.position ?? -1) + 1;

    const rows = incoming.map((t, i) => ({
      project_id: data.projectId,
      user_id: userId,
      title: t.title!.trim().slice(0, 200),
      kind: (t.kind ?? "feature").slice(0, 30),
      status: "planned",
      position: base + i,
      payload: { source: "ai_plan", prompt: data.prompt },
    }));

    const { data: created, error } = await supabase.from("project_tasks").insert(rows).select("*");
    if (error) throw new Error(error.message);
    return { tasks: created as WorkflowTask[], created: created?.length ?? 0 };
  });

// ---------------------------------------------------------------------------
// nextBestTask — AI reviews planned tasks plus current project state and
// recommends which single task to build next, with a short justification.
// ---------------------------------------------------------------------------
export const nextBestTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ projectId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;

    const [{ data: tasks }, { data: files }] = await Promise.all([
      supabase
        .from("project_tasks")
        .select("id,title,status,kind")
        .eq("project_id", data.projectId),
      supabase
        .from("project_files")
        .select("path,file_type,service_location")
        .eq("project_id", data.projectId)
        .limit(80),
    ]);

    const open = (tasks ?? []).filter(
      (t: any) => t.status === "planned" || t.status === "todo" || t.status === "needs_fix",
    );
    if (open.length === 0) {
      return { task: null, reason: "No open tasks. Try Finish This Game or add a new task." };
    }

    // Heuristic fallback before AI: prioritise needs_fix > saves/datastore > leaderstats > UI polish.
    const score = (t: { title: string; status: string; kind: string }) => {
      const title = t.title.toLowerCase();
      let s = 0;
      if (t.status === "needs_fix") s += 100;
      if (/save|datastore|persist/.test(title)) s += 40;
      if (/leaderstat|currency|coin/.test(title)) s += 30;
      if (/remote|security|server/.test(title)) s += 25;
      if (/ui|gui|hud/.test(title)) s += 10;
      if (/polish|effect|sound/.test(title)) s -= 5;
      return s;
    };
    const ranked = [...open].sort((a, b) => score(b) - score(a));
    const pick = ranked[0];

    const fileSummary =
      (files ?? []).length === 0
        ? "no scripts yet"
        : (files ?? [])
            .slice(0, 10)
            .map((f: any) => `${f.service_location}/${f.path}`)
            .join(", ");

    const reason =
      pick.status === "needs_fix"
        ? `${pick.title} is marked as needs_fix — fix blockers before adding new systems.`
        : /save|datastore/.test(pick.title.toLowerCase())
          ? `${pick.title} should come early so progress doesn't reset between sessions.`
          : `${pick.title} unlocks downstream tasks. Current files: ${fileSummary}.`;

    return { task: pick, reason };
  });

// ---------------------------------------------------------------------------
// finishThisGame — scans the project (files, tasks, recent errors) and
// returns a completion report: complete, missing, suggestions.
// ---------------------------------------------------------------------------
const REQUIRED_SYSTEMS = [
  { key: "leaderstats", label: "Leaderstats / currency", match: /leaderstat|currency|coin/i },
  {
    key: "datastore",
    label: "DataStore saving",
    match: /datastore|saveprofile|profilestore|persist/i,
  },
  {
    key: "remotes",
    label: "RemoteEvents / server validation",
    match: /remoteevent|remotefunction|firserver|onserverevent/i,
  },
  { key: "ui", label: "Mobile-friendly UI", match: /screengui|udim2|frame/i },
  {
    key: "shop",
    label: "Shop or monetization",
    match: /shop|marketplaceservice|gamepass|developerproduct/i,
  },
  { key: "spawn", label: "Spawn / round system", match: /spawnlocation|teleport|round/i },
];

export const finishThisGame = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ projectId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;

    const [{ data: files }, { data: tasks }, { data: errs }] = await Promise.all([
      supabase
        .from("project_files")
        .select("path,content,service_location,file_type")
        .eq("project_id", data.projectId)
        .limit(200),
      supabase.from("project_tasks").select("title,status").eq("project_id", data.projectId),
      supabase
        .from("studio_errors")
        .select("id,error_message,file_path,created_at")
        .eq("project_id", data.projectId)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    const haystack = (files ?? [])
      .map((f: any) => `${f.path}\n${(f.content ?? "").slice(0, 4000)}`)
      .join("\n");

    const systems = REQUIRED_SYSTEMS.map((s) => ({
      key: s.key,
      label: s.label,
      present: s.match.test(haystack),
    }));

    const taskList = tasks ?? [];
    const totalTasks = taskList.length;
    const doneTasks = taskList.filter((t: any) => t.status === "done").length;
    const openTasks = taskList.filter((t: any) => t.status !== "done" && t.status !== "skipped");

    const presentCount = systems.filter((s) => s.present).length;
    const systemScore = systems.length > 0 ? presentCount / systems.length : 0;
    const taskScore = totalTasks > 0 ? doneTasks / totalTasks : systemScore;
    const completion = Math.round((systemScore * 0.6 + taskScore * 0.4) * 100);

    const missing = systems.filter((s) => !s.present).map((s) => s.label);
    const suggestions: string[] = [];
    if (missing.length > 0) {
      suggestions.push(`Build the missing systems: ${missing.slice(0, 3).join(", ")}.`);
    }
    if ((errs ?? []).length > 0) {
      suggestions.push(
        `Fix ${errs!.length} recent Studio error${errs!.length === 1 ? "" : "s"} before adding new features.`,
      );
    }
    if (openTasks.length > 0) {
      suggestions.push(
        `${openTasks.length} task${openTasks.length === 1 ? "" : "s"} still open on the board.`,
      );
    }
    if (suggestions.length === 0)
      suggestions.push("Project looks complete. Polish, playtest, and publish.");

    return {
      completion,
      systems,
      missing,
      suggestions,
      tasks: { total: totalTasks, done: doneTasks, open: openTasks.length },
      errors: errs ?? [],
    };
  });

// ---------------------------------------------------------------------------
// buildTask — marks a task in_progress, asks the AI for a buildable spec,
// then transitions it to needs_testing. The actual code generation reuses
// the existing chat/build flow; this fn focuses on the lifecycle + a brief
// for the user describing what to build, why, where, and how to test.
// ---------------------------------------------------------------------------
export const buildTaskBrief = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ taskId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const { userId } = context;
    const { data: task, error: tErr } = await supabase
      .from("project_tasks")
      .select("*")
      .eq("id", data.taskId)
      .single();
    if (tErr || !task) throw new Error("Task not found.");

    const COST = 1;
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    const isOwner = (roles ?? []).some((r: any) => r.role === "owner" || r.role === "admin");
    if (!isOwner) {
      const { error } = await supabase.rpc("spend_credits_atomic", { _amount: COST });
      if (error) throw new Error("Not enough credits.");
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

    const system = `You are a senior Roblox developer. Given one task, produce a SHORT build brief (<= 120 words) covering:
1) What it is, 2) Where it goes in Studio (services + folders), 3) Server vs client split (security), 4) How to test in Play Solo.
Plain prose, no markdown headers, no code fences. Output text only.`;

    let brief = "";
    try {
      const out = await generateText({
        model,
        system,
        prompt: `Task: ${task.title}\nKind: ${task.kind}`,
      });
      brief = out.text.trim();
    } catch (err) {
      if (!isOwner)
        await supabase.rpc("refund_credits", { _amount: COST, _reason: "brief failed" });
      throw new Error("Brief generation failed: " + String((err as Error).message));
    }

    await supabase
      .from("project_tasks")
      .update({ status: "in_progress", updated_at: new Date().toISOString() })
      .eq("id", task.id);

    return { brief, task: { ...task, status: "in_progress" } };
  });

// ---------------------------------------------------------------------------
// importStudioErrors — turn recent Studio runtime errors into needs_fix
// tasks on the board. Dedupes by normalized title within the project so the
// same error doesn't spawn multiple tasks. This closes the Test → Fix loop
// without spending AI credits.
// ---------------------------------------------------------------------------
export const importStudioErrors = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({ projectId: z.string().uuid(), limit: z.number().min(1).max(50).default(20) })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const { userId } = context;

    const [{ data: errs }, { data: existing }, { data: maxPos }] = await Promise.all([
      supabase
        .from("studio_errors")
        .select("id,error_message,file_path,created_at")
        .eq("project_id", data.projectId)
        .order("created_at", { ascending: false })
        .limit(data.limit),
      supabase.from("project_tasks").select("title,status").eq("project_id", data.projectId),
      supabase
        .from("project_tasks")
        .select("position")
        .eq("project_id", data.projectId)
        .order("position", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (!errs || errs.length === 0) {
      return { created: 0, scanned: 0, reason: "No Studio errors recorded yet." };
    }

    const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 120);
    const existingTitles = new Set((existing ?? []).map((t: any) => norm(t.title)));

    // Group by normalized message so the same error doesn't make 5 tasks.
    const seen = new Set<string>();
    const rows: any[] = [];
    let base = (maxPos?.position ?? -1) + 1;

    for (const e of errs) {
      const msg = (e.error_message ?? "").trim();
      if (!msg) continue;
      const key = norm(msg);
      if (seen.has(key)) continue;
      seen.add(key);
      const title = `Fix: ${msg.split("\n")[0].slice(0, 120)}`;
      if (existingTitles.has(norm(title))) continue;
      rows.push({
        project_id: data.projectId,
        user_id: userId,
        title,
        kind: "bug",
        status: "needs_fix",
        position: base++,
        payload: { source: "studio_error", error_id: e.id, file_path: e.file_path },
      });
    }

    if (rows.length === 0) {
      return { created: 0, scanned: errs.length, reason: "All recent errors already tracked." };
    }

    const { error } = await supabase.from("project_tasks").insert(rows);
    if (error) throw new Error(error.message);
    return { created: rows.length, scanned: errs.length };
  });
