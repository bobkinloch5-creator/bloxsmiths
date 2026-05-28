import { useMemo, useState } from "react";
import {
  X,
  AlertOctagon,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Wand2,
  Loader2,
  ShieldCheck,
  FileCode,
  Radio,
  Folder,
} from "lucide-react";

export type ValidationIssue = {
  level: "error" | "warning";
  scope?: string;
  target: string;
  message: string;
};

export type ValidationEntry = {
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  originalPrompt: string;
};

type Msg = { id: string; role: "user" | "assistant"; content: string };

function suggestFix(issue: ValidationIssue): string {
  const m = issue.message.toLowerCase();
  if (m.includes("localscript") && m.includes("never run")) return "Move to StarterPlayerScripts";
  if (m.includes("server script") && m.includes("unusual")) return "Move to ServerScriptService";
  if (m.includes("unknown service") || m.includes("unknown parent service"))
    return "Replace with a valid Roblox service";
  if (m.includes("unbalanced") || m.includes("luau syntax"))
    return "Regenerate with valid Luau syntax";
  if (m.includes("duplicate path")) return "Rename or merge duplicate file";
  if (m.includes("waitforchild") && m.includes("no matching"))
    return "Create the missing instance or fix the name";
  if (m.includes("missing 'parent'") || m.includes("missing 'name'"))
    return "Add the missing field";
  if (m.includes("unknown remote classname"))
    return "Use RemoteEvent / RemoteFunction / BindableEvent";
  if (m.includes("invalid path")) return "Rewrite path without leading slash or backslashes";
  if (m.includes("missing path")) return "Provide a valid file path";
  return "Regenerate to fix this";
}

function scopeIcon(scope?: string) {
  switch (scope) {
    case "file":
      return FileCode;
    case "remote":
      return Radio;
    case "service":
      return Folder;
    default:
      return AlertOctagon;
  }
}

function stepTitle(msg: Msg | undefined, idx: number, entry: ValidationEntry) {
  const fallback = entry.originalPrompt?.slice(0, 60) || `Step ${idx + 1}`;
  const c = msg?.content ?? "";
  const firstLine = c.split("\n")[0]?.slice(0, 60);
  return firstLine || fallback;
}

export function SyncValidationDrawer({
  open,
  onClose,
  messages,
  validationByMsg,
  onFix,
  autoFixingMsg,
  busy,
  outOfCredits,
  fixCost,
}: {
  open: boolean;
  onClose: () => void;
  messages: Msg[];
  validationByMsg: Record<string, ValidationEntry>;
  onFix: (
    msgId: string,
    opts?: { issues?: ValidationIssue[]; label?: string },
  ) => void | Promise<void>;
  autoFixingMsg: string | null;
  busy: boolean;
  outOfCredits: boolean;
  fixCost: number;
}) {
  const [openStep, setOpenStep] = useState<string | null>(null);

  const steps = useMemo(() => {
    const ids = Object.keys(validationByMsg);
    return ids
      .map((id) => {
        const idx = messages.findIndex((m) => m.id === id);
        return {
          id,
          idx: idx === -1 ? Number.MAX_SAFE_INTEGER : idx,
          msg: messages[idx],
          entry: validationByMsg[id],
        };
      })
      .sort((a, b) => a.idx - b.idx);
  }, [messages, validationByMsg]);

  const totalErrors = steps.reduce((n, s) => n + s.entry.errors.length, 0);
  const totalWarnings = steps.reduce((n, s) => n + s.entry.warnings.length, 0);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      <button
        aria-label="Close sync report"
        onClick={onClose}
        className="flex-1 bg-background/60 backdrop-blur-sm"
      />
      <aside className="w-full max-w-md h-full bg-background border-l border-border shadow-2xl flex flex-col">
        <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary-glow" />
            <h2 className="text-sm font-semibold">Sync validation report</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 hover:bg-surface text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="px-4 py-2 border-b border-border flex items-center gap-3 text-xs">
          <span className="inline-flex items-center gap-1 text-destructive">
            <AlertOctagon className="h-3.5 w-3.5" /> {totalErrors} blocked
          </span>
          <span className="inline-flex items-center gap-1 text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5" /> {totalWarnings} warning
            {totalWarnings === 1 ? "" : "s"}
          </span>
          <span className="ml-auto text-muted-foreground">
            {steps.length} step{steps.length === 1 ? "" : "s"}
          </span>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {steps.length === 0 && (
            <div className="text-xs text-muted-foreground text-center py-10">
              No sync issues recorded yet. Generate something to see results here.
            </div>
          )}

          {steps.map((s, i) => {
            const isOpen = openStep === s.id;
            const title = stepTitle(s.msg, i, s.entry);
            const allIssues: ValidationIssue[] = [...s.entry.errors, ...s.entry.warnings];
            const fixingThis = autoFixingMsg === s.id;
            return (
              <div
                key={s.id}
                className="rounded-lg border border-border bg-surface/40 overflow-hidden"
              >
                <button
                  onClick={() => setOpenStep(isOpen ? null : s.id)}
                  className="w-full flex items-start gap-2 px-3 py-2 text-left hover:bg-surface"
                >
                  {isOpen ? (
                    <ChevronDown className="h-3.5 w-3.5 mt-0.5 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 mt-0.5 text-muted-foreground" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-foreground truncate">
                      Step {i + 1} · {title}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-[10px]">
                      {s.entry.errors.length > 0 && (
                        <span className="inline-flex items-center gap-1 text-destructive">
                          <AlertOctagon className="h-3 w-3" /> {s.entry.errors.length}
                        </span>
                      )}
                      {s.entry.warnings.length > 0 && (
                        <span className="inline-flex items-center gap-1 text-amber-400">
                          <AlertTriangle className="h-3 w-3" /> {s.entry.warnings.length}
                        </span>
                      )}
                    </div>
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-border divide-y divide-border/60">
                    <div className="p-2 flex items-center justify-between gap-2 bg-background/40">
                      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        {allIssues.length} issue{allIssues.length === 1 ? "" : "s"}
                      </span>
                      <button
                        onClick={() =>
                          onFix(s.id, {
                            label: `${s.entry.errors.length} blocked + ${s.entry.warnings.length} warning(s) in step ${i + 1}`,
                          })
                        }
                        disabled={busy || outOfCredits || fixingThis}
                        className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-[10px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                      >
                        {fixingThis ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Wand2 className="h-3 w-3" />
                        )}
                        Fix all ({fixCost} cr)
                      </button>
                    </div>
                    {allIssues.map((iss, j) => {
                      const Icon = scopeIcon(iss.scope);
                      const isErr = iss.level === "error";
                      return (
                        <div key={j} className="p-2.5 space-y-1.5">
                          <div className="flex items-start gap-2">
                            <Icon
                              className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${isErr ? "text-destructive" : "text-amber-400"}`}
                            />
                            <div className="flex-1 min-w-0">
                              <div className="text-[11px] font-mono text-foreground truncate">
                                {iss.target}
                              </div>
                              <div className="text-[11px] text-muted-foreground">{iss.message}</div>
                            </div>
                          </div>
                          <div className="flex items-center justify-between gap-2 pl-5">
                            <span className="text-[10px] italic text-primary-glow truncate">
                              Suggested: {suggestFix(iss)}
                            </span>
                            <button
                              onClick={() =>
                                onFix(s.id, {
                                  issues: [iss],
                                  label: `${isErr ? "blocked" : "warning"}: ${iss.target}`,
                                })
                              }
                              disabled={busy || outOfCredits || fixingThis}
                              className="inline-flex items-center gap-1 rounded border border-border bg-surface px-1.5 py-0.5 text-[10px] font-medium hover:bg-surface-elevated disabled:opacity-50 shrink-0"
                            >
                              <Wand2 className="h-2.5 w-2.5" /> Apply suggested fix
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {outOfCredits && (
          <div className="border-t border-border p-3 text-[11px] text-destructive">
            You're out of credits — fixes are disabled until your balance refills.
          </div>
        )}
      </aside>
    </div>
  );
}
