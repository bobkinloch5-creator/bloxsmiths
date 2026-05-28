import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  listTasks,
  setTaskStatus,
  deleteTask,
  addTask,
  planFromPrompt,
  nextBestTask,
  finishThisGame,
  buildTaskBrief,
  importStudioErrors,
  type WorkflowTask,
} from "@/lib/tasks.functions";
import {
  X,
  Plus,
  Sparkles,
  Wand2,
  ClipboardList,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  PlayCircle,
  RotateCcw,
  Trash2,
  Hammer,
  Bug,
} from "lucide-react";
import { toast } from "sonner";

type Props = {
  projectId: string;
  open: boolean;
  onClose: () => void;
  onBuildTask?: (task: WorkflowTask, brief: string) => void;
};

const COLUMNS: { key: string; label: string; tone: string }[] = [
  { key: "planned", label: "Planned", tone: "bg-muted/40" },
  { key: "in_progress", label: "In Progress", tone: "bg-primary/10" },
  { key: "needs_testing", label: "Needs Testing", tone: "bg-amber-500/10" },
  { key: "needs_fix", label: "Needs Fix", tone: "bg-destructive/10" },
  { key: "done", label: "Done", tone: "bg-emerald-500/10" },
];

function normalizeStatus(s: string): string {
  if (s === "todo") return "planned";
  return s;
}

export function TaskBoard({ projectId, open, onClose, onBuildTask }: Props) {
  const list = useServerFn(listTasks);
  const setStatus = useServerFn(setTaskStatus);
  const del = useServerFn(deleteTask);
  const add = useServerFn(addTask);
  const plan = useServerFn(planFromPrompt);
  const nextBest = useServerFn(nextBestTask);
  const finish = useServerFn(finishThisGame);
  const brief = useServerFn(buildTaskBrief);
  const importErrs = useServerFn(importStudioErrors);

  const [tasks, setTasks] = useState<WorkflowTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [planPrompt, setPlanPrompt] = useState("");
  const [report, setReport] = useState<any | null>(null);

  const refresh = async () => {
    try {
      setLoading(true);
      const res = await list({ data: { projectId } });
      setTasks(res.tasks);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, projectId]);

  if (!open) return null;

  const handleStatus = async (t: WorkflowTask, status: string) => {
    setBusy(t.id);
    try {
      await setStatus({ data: { taskId: t.id, status: status as any } });
      setTasks((cur) => cur.map((x) => (x.id === t.id ? { ...x, status } : x)));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const handleDelete = async (t: WorkflowTask) => {
    if (!confirm(`Delete task "${t.title}"?`)) return;
    setBusy(t.id);
    try {
      await del({ data: { taskId: t.id } });
      setTasks((cur) => cur.filter((x) => x.id !== t.id));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const handleAdd = async () => {
    const title = newTitle.trim();
    if (!title) return;
    try {
      const res = await add({ data: { projectId, title } });
      setTasks((cur) => [...cur, res.task]);
      setNewTitle("");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const handlePlan = async () => {
    const p = planPrompt.trim();
    if (!p) return toast.error("Describe what you want to build.");
    setBusy("__plan");
    try {
      const res = await plan({ data: { projectId, prompt: p } });
      toast.success(`Added ${res.created} task${res.created === 1 ? "" : "s"} to the board.`);
      setPlanPrompt("");
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const handleNextBest = async () => {
    setBusy("__next");
    try {
      const res = await nextBest({ data: { projectId } });
      if (!res.task) toast.message(res.reason);
      else toast.success(`Next: ${res.task.title}`, { description: res.reason });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const handleFinish = async () => {
    setBusy("__finish");
    try {
      const res = await finish({ data: { projectId } });
      setReport(res);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const handleBuild = async (t: WorkflowTask) => {
    setBusy(t.id);
    try {
      const res = await brief({ data: { taskId: t.id } });
      setTasks((cur) => cur.map((x) => (x.id === t.id ? { ...x, status: "in_progress" } : x)));
      onBuildTask?.(t, res.brief);
      toast.success(`Building "${t.title}"`, { description: res.brief.slice(0, 120) });
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const grouped: Record<string, WorkflowTask[]> = {
    planned: [],
    in_progress: [],
    needs_testing: [],
    needs_fix: [],
    done: [],
  };
  for (const t of tasks) {
    const s = normalizeStatus(t.status);
    if (s === "skipped") continue;
    if (grouped[s]) grouped[s].push(t);
    else grouped.planned.push(t);
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-background/60 backdrop-blur-sm" onClick={onClose} />
      <aside className="fixed right-0 top-0 z-50 h-screen w-full sm:w-[640px] lg:w-[820px] bg-background border-l border-border shadow-2xl flex flex-col">
        <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2 min-w-0">
            <ClipboardList className="h-4 w-4 text-primary shrink-0" />
            <div className="min-w-0">
              <h2 className="text-sm font-semibold truncate">Task Board</h2>
              <p className="text-[11px] text-muted-foreground">
                Plan → Build → Insert → Test → Fix
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="h-7 w-7 grid place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-surface-elevated"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="px-4 py-3 border-b border-border space-y-2">
          <div className="flex gap-2">
            <input
              value={planPrompt}
              onChange={(e) => setPlanPrompt(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handlePlan()}
              placeholder='Describe a game or feature (e.g. "mining simulator with pets")'
              className="flex-1 h-9 px-3 rounded-md bg-surface border border-border text-xs focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <button
              onClick={handlePlan}
              disabled={busy === "__plan"}
              className="h-9 px-3 rounded-md bg-primary text-primary-foreground text-xs font-medium inline-flex items-center gap-1.5 hover:opacity-90 disabled:opacity-50"
            >
              {busy === "__plan" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              Auto-plan
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleNextBest}
              disabled={busy === "__next"}
              className="h-8 px-2.5 rounded-md border border-border bg-surface text-xs inline-flex items-center gap-1.5 hover:bg-surface-elevated disabled:opacity-50"
            >
              {busy === "__next" ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Wand2 className="h-3 w-3" />
              )}
              Next Best Task
            </button>
            <button
              onClick={handleFinish}
              disabled={busy === "__finish"}
              className="h-8 px-2.5 rounded-md border border-border bg-surface text-xs inline-flex items-center gap-1.5 hover:bg-surface-elevated disabled:opacity-50"
            >
              {busy === "__finish" ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3 w-3" />
              )}
              Finish This Game
            </button>
            <button
              onClick={async () => {
                setBusy("__errs");
                try {
                  const res = await importErrs({ data: { projectId, limit: 20 } });
                  if (res.created > 0) {
                    toast.success(
                      `Imported ${res.created} fix task${res.created === 1 ? "" : "s"} from Studio errors.`,
                    );
                    await refresh();
                  } else {
                    toast.message(res.reason ?? "Nothing to import.");
                  }
                } catch (e) {
                  toast.error((e as Error).message);
                } finally {
                  setBusy(null);
                }
              }}
              disabled={busy === "__errs"}
              className="h-8 px-2.5 rounded-md border border-border bg-surface text-xs inline-flex items-center gap-1.5 hover:bg-surface-elevated disabled:opacity-50"
              title="Pull recent Studio runtime errors onto the board as needs_fix tasks"
            >
              {busy === "__errs" ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Bug className="h-3 w-3 text-amber-400" />
              )}
              Pull Studio Errors
            </button>
            <div className="flex-1" />
            <div className="flex gap-1">
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                placeholder="New task title"
                className="h-8 px-2 rounded-md bg-surface border border-border text-xs w-44 focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              <button
                onClick={handleAdd}
                className="h-8 w-8 grid place-items-center rounded-md border border-border bg-surface hover:bg-surface-elevated"
                title="Add task"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {report && (
            <div className="mt-2 rounded-md border border-border bg-surface p-3 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <div className="font-semibold">Finish report — {report.completion}% complete</div>
                <button
                  onClick={() => setReport(null)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-primary to-emerald-400"
                  style={{ width: `${report.completion}%` }}
                />
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                {report.systems.map((s: any) => (
                  <div key={s.key} className="flex items-center gap-1.5">
                    {s.present ? (
                      <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                    ) : (
                      <AlertTriangle className="h-3 w-3 text-amber-400" />
                    )}
                    <span className={s.present ? "text-foreground" : "text-muted-foreground"}>
                      {s.label}
                    </span>
                  </div>
                ))}
              </div>
              {report.suggestions?.length > 0 && (
                <ul className="list-disc pl-4 text-muted-foreground space-y-0.5">
                  {report.suggestions.map((s: string, i: number) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {loading ? (
            <div className="grid place-items-center py-16">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : tasks.length === 0 ? (
            <div className="grid place-items-center py-16 text-center px-6">
              <ClipboardList className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm text-foreground font-medium">No tasks yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Describe what you want to build above, or add tasks manually.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
              {COLUMNS.map((col) => (
                <div
                  key={col.key}
                  className={`rounded-lg border border-border ${col.tone} flex flex-col min-h-32`}
                >
                  <div className="px-2.5 py-2 border-b border-border/60 flex items-center justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-foreground/80">
                      {col.label}
                    </span>
                    <span className="text-[10px] text-muted-foreground tabular-nums">
                      {grouped[col.key].length}
                    </span>
                  </div>
                  <div className="p-2 space-y-2 flex-1">
                    {grouped[col.key].map((t) => (
                      <div
                        key={t.id}
                        className="rounded-md bg-background border border-border p-2 shadow-sm"
                      >
                        <div className="flex items-start justify-between gap-1">
                          <p className="text-xs font-medium leading-snug">{t.title}</p>
                          <button
                            onClick={() => handleDelete(t)}
                            disabled={busy === t.id}
                            className="text-muted-foreground hover:text-destructive shrink-0"
                            title="Delete"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                        <div className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                          <span className="px-1 rounded bg-muted">{t.kind}</span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {col.key !== "in_progress" && col.key !== "done" && (
                            <button
                              onClick={() => handleBuild(t)}
                              disabled={busy === t.id}
                              className="h-6 px-1.5 rounded border border-primary/40 bg-primary/10 text-primary text-[10px] inline-flex items-center gap-1 hover:bg-primary/20 disabled:opacity-50"
                              title="Build with AI"
                            >
                              {busy === t.id ? (
                                <Loader2 className="h-2.5 w-2.5 animate-spin" />
                              ) : (
                                <Hammer className="h-2.5 w-2.5" />
                              )}
                              Build
                            </button>
                          )}
                          {col.key === "in_progress" && (
                            <button
                              onClick={() => handleStatus(t, "needs_testing")}
                              disabled={busy === t.id}
                              className="h-6 px-1.5 rounded border border-amber-500/40 bg-amber-500/10 text-amber-400 text-[10px] inline-flex items-center gap-1 hover:bg-amber-500/20"
                            >
                              <PlayCircle className="h-2.5 w-2.5" /> Test
                            </button>
                          )}
                          {col.key === "needs_testing" && (
                            <>
                              <button
                                onClick={() => handleStatus(t, "done")}
                                disabled={busy === t.id}
                                className="h-6 px-1.5 rounded border border-emerald-500/40 bg-emerald-500/10 text-emerald-400 text-[10px] inline-flex items-center gap-1 hover:bg-emerald-500/20"
                              >
                                <CheckCircle2 className="h-2.5 w-2.5" /> Pass
                              </button>
                              <button
                                onClick={() => handleStatus(t, "needs_fix")}
                                disabled={busy === t.id}
                                className="h-6 px-1.5 rounded border border-destructive/40 bg-destructive/10 text-destructive text-[10px] inline-flex items-center gap-1 hover:bg-destructive/20"
                              >
                                <AlertTriangle className="h-2.5 w-2.5" /> Fail
                              </button>
                            </>
                          )}
                          {col.key === "needs_fix" && (
                            <button
                              onClick={() => handleStatus(t, "planned")}
                              disabled={busy === t.id}
                              className="h-6 px-1.5 rounded border border-border text-[10px] inline-flex items-center gap-1 hover:bg-surface-elevated"
                            >
                              <RotateCcw className="h-2.5 w-2.5" /> Replan
                            </button>
                          )}
                          {col.key === "done" && (
                            <button
                              onClick={() => handleStatus(t, "planned")}
                              disabled={busy === t.id}
                              className="h-6 px-1.5 rounded border border-border text-[10px] inline-flex items-center gap-1 hover:bg-surface-elevated"
                              title="Reopen"
                            >
                              <RotateCcw className="h-2.5 w-2.5" /> Reopen
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                    {grouped[col.key].length === 0 && (
                      <p className="text-[10px] text-muted-foreground/60 text-center py-3">empty</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
