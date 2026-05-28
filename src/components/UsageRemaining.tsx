import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronDown, Gauge, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Usage = {
  owner?: boolean;
  limit_5h: number;
  used_5h: number;
  reset_5h?: string | null;
  limit_7d: number;
  used_7d: number;
  reset_7d?: string | null;
};

function fmtReset(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export function UsageRemaining({ defaultOpen = true }: { defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [usage, setUsage] = useState<Usage | null>(null);

  const load = async () => {
    const { data, error } = await supabase.rpc("get_ai_usage" as never);
    if (!error && data) setUsage(data as unknown as Usage);
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, []);

  if (!usage) return null;
  if (usage.owner) return null; // owners have no caps

  const pct5h = Math.min(100, Math.round((usage.used_5h / usage.limit_5h) * 100));
  const pct7d = Math.min(100, Math.round((usage.used_7d / usage.limit_7d) * 100));
  const remaining = Math.max(0, 100 - Math.max(pct5h, pct7d));

  return (
    <div className="rounded-xl border border-border bg-surface/60 backdrop-blur p-3 text-sm">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <span className="flex items-center gap-2 font-medium">
          <Gauge className="h-4 w-4 text-primary" />
          Usage remaining
          <span className="text-muted-foreground font-normal">{remaining}%</span>
        </span>
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "" : "-rotate-90"}`}
        />
      </button>

      {open && (
        <div className="mt-3 space-y-2.5">
          <Row
            label="5h"
            used={usage.used_5h}
            limit={usage.limit_5h}
            pct={pct5h}
            reset={fmtReset(usage.reset_5h)}
          />
          <Row
            label="Weekly"
            used={usage.used_7d}
            limit={usage.limit_7d}
            pct={pct7d}
            reset={fmtReset(usage.reset_7d)}
          />
          <Link
            to="/pricing"
            className="mt-1 flex items-center justify-between rounded-lg border border-border/60 px-2.5 py-1.5 text-xs hover:bg-surface-elevated transition-colors"
          >
            <span>Upgrade for more</span>
            <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
          </Link>
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  used,
  limit,
  pct,
  reset,
}: {
  label: string;
  used: number;
  limit: number;
  pct: number;
  reset: string;
}) {
  const tone = pct >= 100 ? "bg-destructive" : pct >= 80 ? "bg-amber-500" : "bg-primary";
  return (
    <div>
      <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
        <span className="text-foreground">{label}</span>
        <span>
          {pct}% · {reset}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-surface-elevated overflow-hidden">
        <div className={`h-full ${tone} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-0.5 text-[10px] text-muted-foreground/80">
        {used} / {limit} messages
      </div>
    </div>
  );
}
