import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Rocket, Loader2, ExternalLink } from "lucide-react";
import { publishToRoblox, saveRobloxIds } from "@/lib/roblox-publish.functions";

interface Props {
  projectId: string;
  initialUniverseId: string | null;
  initialPlaceId: string | null;
  lastPublishedAt: string | null;
  lastVersion: number | null;
  disabled?: boolean;
}

export function PublishToRobloxButton({
  projectId,
  initialUniverseId,
  initialPlaceId,
  lastPublishedAt,
  lastVersion,
  disabled,
}: Props) {
  const publishFn = useServerFn(publishToRoblox);
  const saveFn = useServerFn(saveRobloxIds);
  const [open, setOpen] = useState(false);
  const [universeId, setUniverseId] = useState(initialUniverseId ?? "");
  const [placeId, setPlaceId] = useState(initialPlaceId ?? "");
  const [busy, setBusy] = useState(false);

  async function doPublish() {
    if (!/^\d+$/.test(universeId) || !/^\d+$/.test(placeId)) {
      toast.error("Universe ID and Place ID must be numeric");
      return;
    }
    setBusy(true);
    try {
      await saveFn({ data: { projectId, universeId, placeId } });
      const r = await publishFn({
        data: { projectId, universeId, placeId, versionType: "Published" },
      });
      toast.success(`Published v${r.versionNumber ?? "?"} to Roblox · ${r.filesUploaded} files`);
      setOpen(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Publish failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        disabled={disabled}
        className="rounded-lg border border-primary/40 bg-primary/10 px-2 sm:px-3 py-1.5 text-xs font-semibold text-primary flex items-center gap-1.5 hover:bg-primary/20 disabled:opacity-50"
        title="Publish this project as a Roblox place via Open Cloud"
        aria-label="Publish to Roblox"
      >
        <Rocket className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Publish to Roblox</span>
        <span className="sm:hidden">Publish</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-background/70 backdrop-blur-sm p-4"
          onClick={() => !busy && setOpen(false)}
        >
          <div
            className="glass w-full max-w-md rounded-2xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Rocket className="h-5 w-5 text-primary" />
              Publish to Roblox
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              We'll build a <code>.rbxlx</code> place from your project and upload it to Roblox
              using Open Cloud. Existing place content will be replaced.
            </p>

            <div className="mt-5 space-y-3">
              <label className="block">
                <span className="text-xs font-medium text-muted-foreground">Universe ID</span>
                <input
                  value={universeId}
                  onChange={(e) => setUniverseId(e.target.value.trim())}
                  placeholder="e.g. 123456789"
                  inputMode="numeric"
                  className="mt-1 w-full rounded-lg bg-surface-elevated border border-border px-3 py-2 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-muted-foreground">Place ID</span>
                <input
                  value={placeId}
                  onChange={(e) => setPlaceId(e.target.value.trim())}
                  placeholder="e.g. 987654321"
                  inputMode="numeric"
                  className="mt-1 w-full rounded-lg bg-surface-elevated border border-border px-3 py-2 text-sm"
                />
              </label>
            </div>

            <details className="mt-3 text-xs text-muted-foreground">
              <summary className="cursor-pointer hover:text-foreground">
                Where do I find these?
              </summary>
              <ol className="mt-2 list-decimal pl-4 space-y-1">
                <li>
                  Open{" "}
                  <a
                    className="underline"
                    href="https://create.roblox.com/dashboard/creations"
                    target="_blank"
                    rel="noopener"
                  >
                    create.roblox.com/dashboard/creations
                  </a>
                  .
                </li>
                <li>
                  Click the experience → copy the Universe ID (top of the URL bar after{" "}
                  <code>/creations/experiences/</code>).
                </li>
                <li>Click the Places tab → copy the start-place's Place ID.</li>
                <li>
                  Ensure your Open Cloud API key has scope <code>universe-places:write</code> for
                  this universe.
                </li>
              </ol>
            </details>

            {lastPublishedAt && (
              <div className="mt-3 text-xs text-muted-foreground flex items-center gap-1">
                Last published: {new Date(lastPublishedAt).toLocaleString()}{" "}
                {lastVersion ? `· v${lastVersion}` : ""}
                <a
                  href={`https://www.roblox.com/games/${initialPlaceId}`}
                  target="_blank"
                  rel="noopener"
                  className="ml-2 inline-flex items-center gap-1 underline hover:text-foreground"
                >
                  Open <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                disabled={busy}
                onClick={() => setOpen(false)}
                className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                disabled={busy || !universeId || !placeId}
                onClick={doPublish}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Rocket className="h-4 w-4" />
                )}
                {busy ? "Publishing..." : "Publish now"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
