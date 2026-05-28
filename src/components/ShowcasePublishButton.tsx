import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { publishToShowcase, unpublishFromShowcase } from "@/lib/showcase.functions";
import { Globe, Loader2, X, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

type Props = {
  projectId: string;
  isPublished: boolean;
  showcaseTitle?: string | null;
  showcaseDescription?: string | null;
  showcaseThumbnailUrl?: string | null;
  projectName: string;
};

export function ShowcasePublishButton({
  projectId,
  isPublished,
  showcaseTitle,
  showcaseDescription,
  showcaseThumbnailUrl,
  projectName,
}: Props) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(showcaseTitle ?? projectName);
  const [description, setDescription] = useState(showcaseDescription ?? "");
  const [thumb, setThumb] = useState(showcaseThumbnailUrl ?? "");
  const qc = useQueryClient();
  const publish = useServerFn(publishToShowcase);
  const unpublish = useServerFn(unpublishFromShowcase);

  const publishMut = useMutation({
    mutationFn: () =>
      publish({
        data: {
          projectId,
          title: title.trim(),
          description: description.trim(),
          thumbnailUrl: thumb.trim() || null,
        },
      }),
    onSuccess: () => {
      toast.success("Published to showcase!");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["project", projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const unpublishMut = useMutation({
    mutationFn: () => unpublish({ data: { projectId } }),
    onSuccess: () => {
      toast.success("Removed from showcase");
      qc.invalidateQueries({ queryKey: ["project", projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <button
        onClick={() => (isPublished ? unpublishMut.mutate() : setOpen(true))}
        disabled={publishMut.isPending || unpublishMut.isPending}
        title={isPublished ? "Remove from public showcase" : "Publish to community showcase"}
        className={`inline-flex items-center gap-1.5 rounded-lg border px-2 sm:px-3 py-1.5 text-xs font-semibold transition ${
          isPublished
            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
            : "border-border hover:border-primary/40 hover:text-primary-glow"
        }`}
      >
        {isPublished ? <EyeOff className="h-3.5 w-3.5" /> : <Globe className="h-3.5 w-3.5" />}
        <span className="hidden sm:inline">{isPublished ? "Showcased" : "Showcase"}</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm grid place-items-center p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-2xl bg-surface-elevated border border-border shadow-2xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Globe className="h-5 w-5 text-primary-glow" />
                Publish to Showcase
              </h3>
              <button
                onClick={() => setOpen(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-sm text-muted-foreground mb-5">
              Share your build with the community. Other creators can like and remix it.
            </p>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Title
                </label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={120}
                  className="mt-1 w-full rounded-lg bg-background border border-border px-3 py-2 text-sm focus:outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={500}
                  rows={4}
                  placeholder="What does your project do? What makes it cool?"
                  className="mt-1 w-full rounded-lg bg-background border border-border px-3 py-2 text-sm focus:outline-none focus:border-primary resize-none"
                />
                <p className="text-xs text-muted-foreground mt-1">{description.length}/500</p>
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Thumbnail URL (optional)
                </label>
                <input
                  value={thumb}
                  onChange={(e) => setThumb(e.target.value)}
                  placeholder="https://..."
                  className="mt-1 w-full rounded-lg bg-background border border-border px-3 py-2 text-sm focus:outline-none focus:border-primary"
                />
              </div>
            </div>

            <div className="mt-6 flex gap-2 justify-end">
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-surface-elevated"
              >
                Cancel
              </button>
              <button
                onClick={() => publishMut.mutate()}
                disabled={
                  publishMut.isPending || title.trim().length < 2 || description.trim().length < 10
                }
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60 inline-flex items-center gap-2"
              >
                {publishMut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Publish
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
