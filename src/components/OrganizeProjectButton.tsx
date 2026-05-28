import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { organizeProject } from "@/lib/builds.functions";
import { FolderTree, Loader2, X, Sparkles, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export function OrganizeProjectButton({
  projectId,
  studioConnected,
}: {
  projectId: string;
  studioConnected: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const fn = useServerFn(organizeProject);

  const run = async () => {
    setBusy(true);
    try {
      const out = await fn({ data: { projectId } });
      toast.success(`Queued ${out.queued} folder${out.queued === 1 ? "" : "s"} for Studio`);
      setDone(true);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not organize project");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        onClick={() => {
          setOpen(true);
          setDone(false);
        }}
        title="Auto-organize Roblox services into clean folders"
        className="h-7 w-7 grid place-items-center rounded-md text-muted-foreground hover:text-primary-glow hover:bg-primary/10 transition"
      >
        <FolderTree className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-background/70 backdrop-blur-sm p-4"
          onClick={() => !busy && setOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl border border-border bg-surface shadow-2xl"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="inline-flex items-center gap-2 text-sm font-semibold">
                <Sparkles className="h-4 w-4 text-primary-glow" /> Organize Project
              </div>
              <button
                onClick={() => !busy && setOpen(false)}
                className="p-1 rounded hover:bg-surface-elevated text-muted-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4 space-y-3 text-xs">
              <p className="text-muted-foreground">
                Creates the standard Roblox folder layout in your Studio place so scripts, remotes,
                modules, UI and map parts have a clean home.
              </p>
              <pre className="rounded-lg border border-border bg-background/60 p-3 text-[10.5px] font-mono leading-relaxed text-foreground/80 overflow-auto max-h-72">
                {`ReplicatedStorage/
  Remotes/   Modules/   Assets/   Shared/
ServerScriptService/
  Systems/   Services/  Modules/
ServerStorage/
  Modules/   Assets/
StarterGui/
  MainUI/    ShopUI/    InventoryUI/
StarterPlayer/
  StarterPlayerScripts/Client/
  StarterCharacterScripts/Character/
Workspace/
  Map/  Interactables/  NPCs/  Spawns/`}
              </pre>
              {!studioConnected && (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-300">
                  Studio plugin isn't connected. Folders will be queued and applied on next
                  connection.
                </div>
              )}
              {done && (
                <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[11px] text-emerald-300 inline-flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Folders queued. Existing folders won't be
                  duplicated.
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border">
              <button
                onClick={() => setOpen(false)}
                disabled={busy}
                className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-surface-elevated disabled:opacity-50"
              >
                Close
              </button>
              <button
                onClick={run}
                disabled={busy || done}
                className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                {busy ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Sparkles className="h-3 w-3" />
                )}
                {done ? "Queued" : busy ? "Queuing…" : "Organize now"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
