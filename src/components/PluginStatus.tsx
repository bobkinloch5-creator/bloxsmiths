import { Link } from "@tanstack/react-router";
import { Plug, Loader2 } from "lucide-react";
import { usePluginConnection } from "@/hooks/usePluginConnection";

const COPY = {
  connected: {
    label: "Studio connected",
    color: "text-success",
    dot: "bg-success",
    glow: "shadow-[0_0_8px_oklch(0.78_0.18_150/0.7)]",
    pulse: true,
  },
  idle: {
    label: "Studio idle",
    color: "text-[oklch(0.78_0.15_85)]",
    dot: "bg-[oklch(0.78_0.15_85)]",
    glow: "",
    pulse: false,
  },
  offline: {
    label: "Studio offline",
    color: "text-muted-foreground",
    dot: "bg-muted-foreground/60",
    glow: "",
    pulse: false,
  },
  loading: {
    label: "Checking…",
    color: "text-muted-foreground",
    dot: "bg-muted-foreground/60",
    glow: "",
    pulse: false,
  },
} as const;

export function PluginStatus({ compact = false }: { compact?: boolean }) {
  const { state, lastConnectedAt, placeName } = usePluginConnection();
  const c = COPY[state];
  const title =
    state === "connected"
      ? `Roblox Studio plugin is online${placeName ? ` · ${placeName}` : ""}`
      : state === "idle"
        ? `Last seen ${lastConnectedAt ? new Date(lastConnectedAt).toLocaleTimeString() : "recently"}`
        : state === "offline"
          ? "Plugin not connected — click to set up"
          : "Checking plugin status…";

  return (
    <Link
      to="/plugin"
      title={title}
      aria-label={title}
      className={`inline-flex items-center gap-1.5 rounded-full border border-border bg-surface/60 backdrop-blur px-2.5 py-1 text-xs ${c.color} hover:bg-surface transition`}
    >
      <span className="relative inline-flex h-2 w-2">
        {state === "connected" && (
          <span className="absolute inset-0 rounded-full bg-success/60 animate-ping" />
        )}
        <span className={`relative inline-block h-2 w-2 rounded-full ${c.dot} ${c.glow}`} />
      </span>
      {state === "loading" ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <Plug className="h-3 w-3" />
      )}
      {!compact && <span className="font-medium">{c.label}</span>}
    </Link>
  );
}
