// Studio runtime-error feedback loop.
//
// The Studio plugin already reports runtime/compile errors to the
// /api/public/plugin/errors endpoint, which stores them in `studio_errors`.
// Those errors were collected but never fed back to the AI. This module closes
// the loop: it fetches the most recent errors for a project and formats them
// into a context block the model sees BEFORE its next generation, so it can
// fix the actual failure instead of guessing.
//
// We bound by recency (a time window + a small cap) rather than a "resolved"
// flag — there is no resolved column, and stale errors from days ago should not
// keep haunting every future build. The window keeps the signal fresh.

type SupabaseLike = {
  from: (table: string) => any;
};

export type StudioErrorRow = {
  error_message: string;
  file_path: string | null;
  created_at: string;
};

function compact(text: string, maxChars: number): string {
  const t = String(text ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (t.length <= maxChars) return t;
  return `${t.slice(0, maxChars - 9).trim()} [trimmed]`;
}

// Collapse duplicate/near-duplicate error messages (the same error often fires
// many times) so the model sees distinct problems, not 40 copies of one.
function dedupe(rows: StudioErrorRow[]): StudioErrorRow[] {
  const seen = new Set<string>();
  const out: StudioErrorRow[] = [];
  for (const r of rows) {
    // Normalize: drop line/column numbers and addresses so "X at line 12" and
    // "X at line 30" collapse to one representative entry.
    const norm = String(r.error_message ?? "")
      .toLowerCase()
      .replace(/\d+/g, "#")
      .replace(/0x[0-9a-f]+/g, "#")
      .replace(/\s+/g, " ")
      .trim();
    const key = `${r.file_path ?? ""}::${norm}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

/**
 * Build a prompt block of recent Studio errors for a project, or "" if none.
 *
 * @param windowMinutes only include errors newer than this many minutes
 * @param limit         maximum distinct errors to surface
 * @param maxChars      hard cap on the returned block size
 */
export async function buildStudioErrorBlock(
  supabase: SupabaseLike,
  projectId: string,
  opts: { windowMinutes?: number; limit?: number; maxChars?: number } = {},
): Promise<string> {
  const windowMinutes = opts.windowMinutes ?? 60;
  const limit = opts.limit ?? 6;
  const maxChars = opts.maxChars ?? 1200;

  const since = new Date(Date.now() - windowMinutes * 60_000).toISOString();

  let data: StudioErrorRow[] | null = null;
  try {
    const res = await supabase
      .from("studio_errors")
      .select("error_message,file_path,created_at")
      .eq("project_id", projectId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(40);
    data = res?.data ?? null;
    if (res?.error) {
      console.warn(
        "[ai-studio-errors] could not load studio errors:",
        res.error.message ?? res.error,
      );
      return "";
    }
  } catch (e) {
    console.warn("[ai-studio-errors] load threw:", e instanceof Error ? e.message : e);
    return "";
  }

  if (!data || data.length === 0) return "";

  const distinct = dedupe(data).slice(0, limit);
  if (distinct.length === 0) return "";

  const lines = distinct.map((e) => {
    const where = e.file_path ? `${compact(e.file_path, 120)}: ` : "";
    return `- ${where}${compact(e.error_message, 220)}`;
  });

  return (
    `RECENT STUDIO ERRORS (reported by the plugin from the live game — these are REAL failures in code already applied):\n` +
    `${lines.join("\n")}\n` +
    `If the user's request relates to any of these, FIX the root cause: patch the offending file, add the missing instance/remote/service, or guard the nil access. Do not repeat the broken pattern.`
  ).slice(0, maxChars);
}
