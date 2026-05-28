import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { applyGeneration } from "@/lib/ai.functions";
import { toast } from "sonner";
import {
  FileCode,
  Radio,
  Box,
  Folder,
  Image as ImageIcon,
  Wand2,
  Send,
  X,
  ChevronDown,
  ChevronRight,
  Loader2,
  CheckCircle2,
  Zap,
  Eye,
  Copy,
} from "lucide-react";

type AnyAction = { type: string; [k: string]: any };
type GenFile = { path: string; file_type: string; service_location: string; content: string };

export type PreviewPayload = {
  generationId: string;
  files: GenFile[];
  actions: AnyAction[];
};

const REMOTE_CLASSES = new Set([
  "RemoteEvent",
  "RemoteFunction",
  "BindableEvent",
  "BindableFunction",
]);
const BUILD_CLASSES = new Set([
  "Part",
  "MeshPart",
  "WedgePart",
  "TrussPart",
  "CornerWedgePart",
  "Model",
  "Folder",
  "Attachment",
  "Decal",
  "Texture",
  "SurfaceGui",
  "BillboardGui",
]);
const UI_CLASSES = new Set([
  "ScreenGui",
  "Frame",
  "TextLabel",
  "TextButton",
  "TextBox",
  "ImageLabel",
  "ImageButton",
  "ScrollingFrame",
  "UIListLayout",
  "UIGridLayout",
  "UIPadding",
  "UICorner",
  "UIStroke",
]);

function groupActions(files: GenFile[], actions: AnyAction[]) {
  const scripts = files.map((f) => ({
    icon: FileCode,
    label: f.path,
    sub: `${f.file_type} · ${f.service_location}`,
  }));

  const remotes: { icon: any; label: string; sub: string }[] = [];
  const builds: { icon: any; label: string; sub: string }[] = [];
  const ui: { icon: any; label: string; sub: string }[] = [];
  const assets: { icon: any; label: string; sub: string }[] = [];
  const structure: { icon: any; label: string; sub: string }[] = [];
  const other: { icon: any; label: string; sub: string }[] = [];

  for (const a of actions) {
    const t = a.type;
    const cls = a.className || a.class || "";
    const parent = a.parent || a.parentPath || "";
    const name = a.name || a.path || "";
    const label = name || cls || t;
    const sub = parent ? `in ${parent}` : t;
    if (t === "insertAsset") {
      assets.push({
        icon: ImageIcon,
        label: `Asset ${a.assetId ?? a.id ?? ""}`,
        sub: parent || "Workspace",
      });
    } else if (REMOTE_CLASSES.has(cls)) {
      remotes.push({ icon: Radio, label, sub });
    } else if (UI_CLASSES.has(cls)) {
      ui.push({ icon: Wand2, label, sub });
    } else if (BUILD_CLASSES.has(cls)) {
      builds.push({ icon: Box, label, sub });
    } else if (cls === "Folder" || t === "createFolder" || t === "ensureFolder") {
      structure.push({ icon: Folder, label, sub });
    } else if (t === "script") {
      // already covered by files
    } else {
      other.push({ icon: Wand2, label: `${t}${name ? ` · ${name}` : ""}`, sub });
    }
  }

  // Services touched: union of file service_locations and action parents (top-level service)
  const services = new Set<string>();
  for (const f of files) services.add(f.service_location.split("/")[0]);
  for (const a of actions) {
    const p = (a.parent || a.parentPath || "") as string;
    if (p) services.add(p.split("/")[0]);
  }

  return { scripts, remotes, builds, ui, assets, structure, other, services: [...services] };
}

export function PushPreview({
  preview,
  onApplied,
  onDiscarded,
  autoApply = false,
  readOnly = false,
}: {
  preview: PreviewPayload;
  onApplied: () => void;
  onDiscarded: () => void;
  autoApply?: boolean;
  readOnly?: boolean;
}) {
  const apply = useServerFn(applyGeneration);
  const [status, setStatus] = useState<"idle" | "applying" | "done" | "skipped">("idle");
  const [openSection, setOpenSection] = useState<string | null>("scripts");
  const [openScript, setOpenScript] = useState<string | null>(null);
  const autoFiredRef = useRef(false);

  const grouped = useMemo(() => groupActions(preview.files, preview.actions), [preview]);

  const totalOps =
    preview.files.length +
    grouped.remotes.length +
    grouped.builds.length +
    grouped.ui.length +
    grouped.assets.length +
    grouped.structure.length +
    grouped.other.length;

  const nonScriptSections: {
    id: string;
    title: string;
    icon: any;
    items: { icon: any; label: string; sub: string }[];
  }[] = [
    { id: "remotes", title: "Remotes & Events", icon: Radio, items: grouped.remotes },
    { id: "ui", title: "UI elements", icon: Wand2, items: grouped.ui },
    { id: "builds", title: "Parts & models", icon: Box, items: grouped.builds },
    { id: "structure", title: "Folders", icon: Folder, items: grouped.structure },
    { id: "assets", title: "Free assets", icon: ImageIcon, items: grouped.assets },
    { id: "other", title: "Other actions", icon: Wand2, items: grouped.other },
  ].filter((s) => s.items.length > 0);

  const doApply = async () => {
    setStatus("applying");
    try {
      const out = await apply({ data: { generationId: preview.generationId } });
      if (out.alreadyApplied) {
        toast.info("Already queued earlier.");
        setStatus("done");
      } else {
        toast.success(
          `Queued ${out.queued} action${out.queued === 1 ? "" : "s"} for the Studio plugin`,
        );
        setStatus("done");
      }
      onApplied();
    } catch (e: any) {
      toast.error(e.message ?? "Push failed");
      setStatus("idle");
    }
  };

  // Auto Execute mode: push to Studio immediately, no approval needed.
  useEffect(() => {
    if (autoApply && status === "idle" && totalOps > 0 && !autoFiredRef.current) {
      autoFiredRef.current = true;
      doApply();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoApply, status, totalOps]);

  if (totalOps === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface/40 p-3 text-xs text-muted-foreground">
        Nothing to push to Studio.
      </div>
    );
  }

  // Auto Execute mode: push to Studio immediately, no approval needed.

  if (status === "skipped") {
    return (
      <div className="rounded-xl border border-border bg-surface/40 p-3 text-xs text-muted-foreground italic">
        Skipped — nothing was queued for Studio.
      </div>
    );
  }
  if (status === "done") {
    return (
      <div className="rounded-xl border border-success/30 bg-success/5 p-3 text-xs text-success flex items-center gap-2">
        <CheckCircle2 className="h-3.5 w-3.5" /> Queued for Studio · waiting for plugin
        confirmation.
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl border p-3 space-y-2.5 ${readOnly ? "border-border bg-surface/40" : "border-primary/30 bg-primary/[0.06]"}`}
    >
      <div className="flex items-center justify-between gap-2 text-xs">
        <div className="font-semibold text-foreground inline-flex items-center gap-1.5">
          {readOnly ? (
            <>
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> What BloxSmith built
            </>
          ) : (
            <>
              <Send className="h-3.5 w-3.5 text-primary-glow" /> Ready to push to Roblox Studio
            </>
          )}
        </div>
        <div className="text-muted-foreground">
          {totalOps} op{totalOps !== 1 ? "s" : ""} · {grouped.services.length} service
          {grouped.services.length !== 1 ? "s" : ""}
        </div>
      </div>

      {grouped.services.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {grouped.services.map((s) => (
            <span
              key={s}
              className="inline-flex items-center gap-1 rounded-full bg-surface border border-border px-2 py-0.5 text-[10px] text-muted-foreground"
            >
              <Folder className="h-2.5 w-2.5" /> {s}
            </span>
          ))}
        </div>
      )}

      <div className="space-y-1 max-h-[28rem] overflow-y-auto pr-1">
        {preview.files.length > 0 &&
          (() => {
            const open = openSection === "scripts";
            return (
              <div className="rounded-lg border border-border bg-surface/40 overflow-hidden">
                <button
                  onClick={() => setOpenSection(open ? null : "scripts")}
                  className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 text-xs hover:bg-surface text-left"
                >
                  <span className="inline-flex items-center gap-1.5 font-medium">
                    {open ? (
                      <ChevronDown className="h-3 w-3" />
                    ) : (
                      <ChevronRight className="h-3 w-3" />
                    )}
                    <FileCode className="h-3.5 w-3.5 text-primary-glow" />
                    Scripts
                  </span>
                  <span className="text-[10px] tabular-nums text-muted-foreground bg-background px-1.5 py-0.5 rounded">
                    {preview.files.length}
                  </span>
                </button>
                {open && (
                  <ul className="border-t border-border divide-y divide-border/60">
                    {preview.files.map((f, i) => {
                      const key = `${f.path}-${i}`;
                      const codeOpen = openScript === key;
                      const lines = (f.content ?? "").split("\n").length;
                      return (
                        <li key={key} className="text-[11px]">
                          <div className="px-2.5 py-1.5 flex items-start gap-2">
                            <FileCode className="h-3 w-3 mt-0.5 text-muted-foreground shrink-0" />
                            <div className="min-w-0 flex-1">
                              <div className="truncate font-mono text-foreground">{f.path}</div>
                              <div className="text-muted-foreground truncate">
                                {f.file_type} · {f.service_location} · {lines} line
                                {lines === 1 ? "" : "s"}
                              </div>
                            </div>
                            <button
                              onClick={() => setOpenScript(codeOpen ? null : key)}
                              className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground hover:bg-surface shrink-0"
                              title={codeOpen ? "Hide code" : "View code"}
                            >
                              <Eye className="h-3 w-3" />
                              {codeOpen ? "Hide" : "View"}
                            </button>
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(f.content ?? "");
                                toast.success("Copied script");
                              }}
                              className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground hover:bg-surface shrink-0"
                              title="Copy code"
                            >
                              <Copy className="h-3 w-3" />
                            </button>
                          </div>
                          {codeOpen && (
                            <pre className="mx-2.5 mb-2 max-h-72 overflow-auto rounded-md border border-border bg-background/80 p-2 text-[10.5px] leading-snug font-mono text-foreground/90 whitespace-pre">
                              {f.content || "// (empty file)"}
                            </pre>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })()}

        {nonScriptSections.map((sec) => {
          const open = openSection === sec.id;
          return (
            <div
              key={sec.id}
              className="rounded-lg border border-border bg-surface/40 overflow-hidden"
            >
              <button
                onClick={() => setOpenSection(open ? null : sec.id)}
                className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 text-xs hover:bg-surface text-left"
              >
                <span className="inline-flex items-center gap-1.5 font-medium">
                  {open ? (
                    <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ChevronRight className="h-3 w-3" />
                  )}
                  <sec.icon className="h-3.5 w-3.5 text-primary-glow" />
                  {sec.title}
                </span>
                <span className="text-[10px] tabular-nums text-muted-foreground bg-background px-1.5 py-0.5 rounded">
                  {sec.items.length}
                </span>
              </button>
              {open && (
                <ul className="border-t border-border divide-y divide-border/60">
                  {sec.items.slice(0, 50).map((it, i) => (
                    <li key={i} className="px-2.5 py-1.5 text-[11px] flex items-start gap-2">
                      <it.icon className="h-3 w-3 mt-0.5 text-muted-foreground shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-mono text-foreground">{it.label}</div>
                        <div className="text-muted-foreground truncate">{it.sub}</div>
                      </div>
                    </li>
                  ))}
                  {sec.items.length > 50 && (
                    <li className="px-2.5 py-1 text-[10px] text-muted-foreground italic">
                      …and {sec.items.length - 50} more
                    </li>
                  )}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      {!readOnly && (
        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            onClick={() => {
              setStatus("skipped");
              onDiscarded();
            }}
            disabled={status !== "idle"}
            className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-surface disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            <X className="h-3 w-3" /> Discard
          </button>
          <button
            onClick={doApply}
            disabled={status !== "idle"}
            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            {status === "applying" ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Zap className="h-3 w-3" />
            )}
            {status === "applying" ? "Pushing…" : "Approve & Push to Studio"}
          </button>
        </div>
      )}
    </div>
  );
}
