import { useState, useRef, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, Cpu, Check } from "lucide-react";
import { saveProjectAiSettings } from "@/lib/project-ai.functions";
import {
  SITE_MODEL_DESCRIPTIONS,
  SITE_PROVIDER_LABELS,
  SITE_PROVIDER_MODELS,
  type SiteProviderId,
} from "@/lib/ai-models";

type ProviderId = SiteProviderId;

export function ModelPicker({
  projectId,
  provider,
  model,
  onChange,
}: {
  projectId: string;
  provider: ProviderId | null;
  model: string | null;
  onChange: (provider: ProviderId, model: string) => void;
}) {
  const save = useServerFn(saveProjectAiSettings);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  const currentProvider: ProviderId =
    provider && provider in SITE_PROVIDER_LABELS ? provider : "neokens";
  const currentModel = model ?? SITE_PROVIDER_MODELS[currentProvider][0];

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const pick = async (p: ProviderId, m: string) => {
    setSaving(true);
    try {
      await save({ data: { projectId, mode: "api_key", provider: p, model: m } });
      onChange(p, m);
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const shortModel = currentModel.length > 22 ? currentModel.slice(0, 22) + "…" : currentModel;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-full bg-surface-elevated/60 border border-border/40 px-2.5 py-0.5 text-[10px] hover:border-primary/60 transition"
        title="Choose AI provider and model"
      >
        <Cpu className="h-3 w-3 text-primary" />
        <span className="text-muted-foreground">
          {SITE_PROVIDER_LABELS[currentProvider]} · {shortModel}
        </span>
        <ChevronDown className="h-3 w-3 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute bottom-full mb-2 left-0 z-50 w-[22rem] max-h-[28rem] overflow-y-auto rounded-xl border border-border/60 bg-surface-elevated/95 backdrop-blur-xl shadow-2xl p-2">
          {(Object.keys(SITE_PROVIDER_LABELS) as ProviderId[]).map((p) => (
            <div key={p} className="mb-2">
              <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                {SITE_PROVIDER_LABELS[p]}
              </div>
              {SITE_PROVIDER_MODELS[p].map((m) => {
                const active = p === currentProvider && m === currentModel;
                const desc = SITE_MODEL_DESCRIPTIONS[m];
                return (
                  <button
                    key={`${p}:${m}`}
                    type="button"
                    disabled={saving}
                    onClick={() => pick(p, m)}
                    className={`w-full text-left rounded-md px-2 py-1.5 transition ${
                      active ? "bg-primary/15 text-foreground" : "hover:bg-surface/60"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`truncate text-xs font-medium ${active ? "text-foreground" : "text-foreground/90"}`}
                      >
                        {m}
                      </span>
                      {active && <Check className="h-3 w-3 text-primary shrink-0" />}
                    </div>
                    {desc && (
                      <div className="mt-0.5 text-[10px] leading-snug text-muted-foreground">
                        {desc}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
          <div className="px-2 py-1 text-[10px] text-muted-foreground border-t border-border/40 mt-1">
            Neokens is free (admin keys). Pick by what you're building in Roblox.
          </div>
        </div>
      )}
    </div>
  );
}
