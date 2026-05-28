import { useMemo, useState } from "react";
import { Copy, Check, Terminal, Apple, MonitorCog } from "lucide-react";
import { toast } from "sonner";

const PLUGIN_URL = "https://bloxsmith.pro/BloxSmith.lua";

const PS_CMD = `powershell -NoProfile -Command "$d=Join-Path $env:LOCALAPPDATA 'Roblox\\\\Plugins'; New-Item -ItemType Directory -Force -Path $d | Out-Null; Invoke-WebRequest -Uri '${PLUGIN_URL}' -OutFile (Join-Path $d 'BloxSmith.lua'); Write-Host 'Installed to' $d"`;

const MAC_CMD = `mkdir -p "$HOME/Documents/Roblox/Plugins" && curl -fsSL "${PLUGIN_URL}" -o "$HOME/Documents/Roblox/Plugins/BloxSmith.lua" && echo "Installed to $HOME/Documents/Roblox/Plugins"`;

function detectOS(): "win" | "mac" {
  if (typeof navigator === "undefined") return "win";
  return /Mac|iPhone|iPad/i.test(navigator.userAgent) ? "mac" : "win";
}

export function AutoPluginInstaller({ onInstalled }: { onInstalled?: () => void }) {
  const [os, setOs] = useState<"win" | "mac">(() => detectOS());
  const [copied, setCopied] = useState(false);
  const cmd = useMemo(() => (os === "mac" ? MAC_CMD : PS_CMD), [os]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(cmd);
      setCopied(true);
      toast.success("Installer command copied — paste it into a terminal");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy — select and copy manually");
    }
  };

  return (
    <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Terminal className="h-4 w-4 text-primary-glow" />
          Auto-install (one command)
        </div>
        <div className="inline-flex rounded-lg border border-border bg-surface-elevated overflow-hidden text-xs">
          <button
            type="button"
            onClick={() => setOs("win")}
            className={`px-3 py-1.5 inline-flex items-center gap-1.5 transition ${os === "win" ? "bg-primary text-primary-foreground" : "hover:bg-surface"}`}
          >
            <MonitorCog className="h-3.5 w-3.5" /> Windows
          </button>
          <button
            type="button"
            onClick={() => setOs("mac")}
            className={`px-3 py-1.5 inline-flex items-center gap-1.5 transition ${os === "mac" ? "bg-primary text-primary-foreground" : "hover:bg-surface"}`}
          >
            <Apple className="h-3.5 w-3.5" /> macOS
          </button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        {os === "win"
          ? "Open PowerShell (Win + R → type powershell → Enter), paste, and hit Enter. Then restart Roblox Studio."
          : "Open Terminal (⌘ + Space → type terminal → Enter), paste, and hit Enter. Then restart Roblox Studio."}
      </p>

      <div className="relative">
        <pre className="rounded-lg bg-surface-elevated/70 border border-border p-3 text-[11px] font-mono text-foreground overflow-x-auto whitespace-pre-wrap break-all max-h-48">
          {cmd}
        </pre>
        <button
          type="button"
          onClick={copy}
          className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground hover:opacity-90"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      {onInstalled && (
        <button
          type="button"
          onClick={onInstalled}
          className="w-full sm:w-auto rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          I ran it — continue
        </button>
      )}
    </div>
  );
}
