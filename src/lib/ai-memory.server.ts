type SupabaseLike = {
  from: (table: string) => any;
};

type MemoryCandidate = {
  key: string;
  kind: "preference" | "project_fact" | "recent";
  value: string;
  confidence: number;
};

function compactMemoryText(value: string, maxChars: number): string {
  const text = String(value ?? "")
    .replace(/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/g, "[image omitted]")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars - 12).trim()} [trimmed]`;
}

function slugKey(prefix: string, value: string): string {
  const slug =
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 48) || "item";
  return `${prefix}_${slug}`.slice(0, 80);
}

function pushUnique(list: MemoryCandidate[], item: MemoryCandidate) {
  if (!item.value || item.value.length < 3) return;
  const duplicate = list.some(
    (m) => m.key === item.key || m.value.toLowerCase() === item.value.toLowerCase(),
  );
  if (!duplicate) list.push(item);
}

export function extractProjectMemories(
  prompt: string,
  result?: {
    message?: string;
    files?: unknown[];
    actions?: unknown[];
  },
): MemoryCandidate[] {
  const text = compactMemoryText(prompt, 900);
  const lower = text.toLowerCase();
  const memories: MemoryCandidate[] = [];

  const explicit = /\b(?:remember(?: that)?|keep in mind|note that)\s+(.{4,220})/i.exec(text)?.[1];
  if (explicit) {
    pushUnique(memories, {
      key: slugKey("note", explicit),
      kind: "preference",
      value: compactMemoryText(explicit, 220),
      confidence: 0.9,
    });
  }

  const preference =
    /\b(always|never|prefer|avoid|don't|do not|use|make sure)\s+([^.!?\n]{6,180})/i.exec(text);
  if (preference) {
    pushUnique(memories, {
      key: slugKey("preference", `${preference[1]} ${preference[2]}`),
      kind: "preference",
      value: compactMemoryText(`${preference[1]} ${preference[2]}`, 220),
      confidence: 0.78,
    });
  }

  const gameName =
    /\b(?:game|project|experience)\s+(?:is\s+)?(?:called|named)\s+["']?([^"'.!\n]{2,60})/i.exec(
      text,
    )?.[1] ??
    /\b(?:call|name)\s+(?:the\s+)?(?:game|project|experience)\s+["']?([^"'.!\n]{2,60})/i.exec(
      text,
    )?.[1];
  if (gameName) {
    pushUnique(memories, {
      key: "game_name",
      kind: "project_fact",
      value: compactMemoryText(gameName, 80),
      confidence: 0.88,
    });
  }

  const theme = /\b(?:theme|style|vibe)\s+(?:is|should be|:|=)\s+([^.!?\n]{3,120})/i.exec(
    text,
  )?.[1];
  if (theme) {
    pushUnique(memories, {
      key: "visual_style",
      kind: "project_fact",
      value: compactMemoryText(theme, 140),
      confidence: 0.75,
    });
  }

  const genre =
    /\b(obby|tycoon|simulator|rpg|horror|roleplay|tower defense|fps|shooter|combat|pet simulator|adventure|survival)\b/i.exec(
      lower,
    )?.[1];
  if (genre) {
    pushUnique(memories, {
      key: "game_genre",
      kind: "project_fact",
      value: genre,
      confidence: 0.7,
    });
  }

  pushUnique(memories, {
    key: "last_user_request",
    kind: "recent",
    value: compactMemoryText(text, 260),
    confidence: 0.55,
  });

  if (result) {
    const files = Array.isArray(result.files) ? result.files.length : 0;
    const actions = Array.isArray(result.actions) ? result.actions.length : 0;
    const message = compactMemoryText(result.message ?? "", 180);
    pushUnique(memories, {
      key: "last_ai_result",
      kind: "recent",
      value: compactMemoryText(`${files} file(s), ${actions} Studio action(s). ${message}`, 260),
      confidence: 0.55,
    });
  }

  return memories.slice(0, 8);
}

export async function rememberProjectInteraction(
  supabase: SupabaseLike,
  opts: {
    projectId: string;
    userId: string;
    prompt: string;
    result?: { message?: string; files?: unknown[]; actions?: unknown[] };
  },
) {
  const memories = extractProjectMemories(opts.prompt, opts.result);
  if (memories.length === 0) return;

  const rows = memories.map((m) => ({
    project_id: opts.projectId,
    user_id: opts.userId,
    key: m.key,
    kind: m.kind,
    value: m.value,
    confidence: m.confidence,
    source_prompt: compactMemoryText(opts.prompt, 500),
    last_seen_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from("project_ai_memories")
    .upsert(rows, { onConflict: "project_id,key" });
  if (error) {
    console.warn("[ai-memory] could not persist project memory:", error.message ?? error);
  }
}

export async function buildProjectMemoryBlock(
  supabase: SupabaseLike,
  projectId: string,
  opts: { limit?: number; maxChars?: number } = {},
): Promise<string> {
  const limit = opts.limit ?? 12;
  const maxChars = opts.maxChars ?? 1400;
  const { data, error } = await supabase
    .from("project_ai_memories")
    .select("kind,key,value,updated_at,last_seen_at,confidence")
    .eq("project_id", projectId)
    .order("last_seen_at", { ascending: false })
    .limit(limit);

  if (error || !data?.length) {
    if (error) console.warn("[ai-memory] could not load project memory:", error.message ?? error);
    return "";
  }

  const lines = data.map((m: any) => {
    const kind = String(m.kind ?? "memory").replace(/_/g, " ");
    const key = String(m.key ?? "note").replace(/_/g, " ");
    return `- ${kind}: ${key} = ${compactMemoryText(String(m.value ?? ""), 220)}`;
  });

  return `PROJECT MEMORY (persistent; use when relevant, but live files/workspace override stale notes):\n${lines.join("\n")}`.slice(
    0,
    maxChars,
  );
}
