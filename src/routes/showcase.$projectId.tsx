import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Header, Footer } from "@/components/layout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { toggleShowcaseLike, remixShowcaseProject } from "@/lib/showcase.functions";
import { Heart, GitFork, Sparkles, Loader2, ArrowLeft, Share2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/showcase/$projectId")({
  component: ShowcaseDetail,
  head: () => ({
    meta: [
      { title: "Roblox Project Showcase Details | BloxSmith" },
      {
        name: "description",
        content:
          "View files, game logic, and showcase details, and remix this Roblox community build built with BloxSmith AI.",
      },
    ],
  }),
});

function ShowcaseDetail() {
  const { projectId } = Route.useParams();
  const { user } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const like = useServerFn(toggleShowcaseLike);
  const remix = useServerFn(remixShowcaseProject);

  const { data, isLoading } = useQuery({
    queryKey: ["showcase", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select(
          "id, showcase_title, showcase_description, showcase_thumbnail_url, showcase_likes_count, showcase_remix_count, name, game_type, description",
        )
        .eq("id", projectId)
        .eq("showcase_published", true)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: liked } = useQuery({
    queryKey: ["showcase-liked", projectId, user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("showcase_likes")
        .select("id")
        .eq("project_id", projectId)
        .eq("user_id", user!.id)
        .maybeSingle();
      return !!data;
    },
  });

  const likeMut = useMutation({
    mutationFn: () => like({ data: { projectId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["showcase", projectId] });
      qc.invalidateQueries({ queryKey: ["showcase-liked", projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remixMut = useMutation({
    mutationFn: () => remix({ data: { sourceId: projectId } }),
    onSuccess: (res) => {
      toast.success("Remixed into your workspace!");
      nav({ to: "/project/$projectId", params: { projectId: res.projectId } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <div className="min-h-screen">
        <Header />
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen">
        <Header />
        <main className="mx-auto max-w-3xl px-4 py-20 text-center">
          <h1 className="text-2xl font-bold">Project not found</h1>
          <p className="text-muted-foreground mt-2">This project may have been unpublished.</p>
          <Link to="/showcase" className="mt-6 inline-block text-primary-glow">
            ← Back to showcase
          </Link>
        </main>
      </div>
    );
  }

  const title = data.showcase_title ?? data.name;
  const desc = data.showcase_description ?? data.description ?? "";

  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto max-w-5xl px-4 sm:px-6 py-10">
        <Link
          to="/showcase"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6"
        >
          <ArrowLeft className="h-4 w-4" /> Back to showcase
        </Link>

        <div className="rounded-2xl overflow-hidden border border-border bg-surface-elevated">
          <div className="aspect-video bg-gradient-to-br from-primary/20 to-accent/10 grid place-items-center">
            {data.showcase_thumbnail_url ? (
              <img
                src={data.showcase_thumbnail_url}
                alt={title}
                className="w-full h-full object-cover"
              />
            ) : (
              <Sparkles className="h-14 w-14 text-primary-glow/60" />
            )}
          </div>
          <div className="p-6 sm:p-8">
            <div className="flex flex-wrap items-start gap-3 justify-between">
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold">{title}</h1>
                <span className="mt-2 inline-block rounded-full bg-primary/10 px-2.5 py-0.5 text-xs text-primary-glow">
                  {data.game_type}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    if (!user) {
                      toast.info("Sign in to like projects");
                      nav({ to: "/login" });
                      return;
                    }
                    likeMut.mutate();
                  }}
                  disabled={likeMut.isPending}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition ${
                    liked
                      ? "bg-red-500/10 border-red-500/40 text-red-400"
                      : "border-border hover:border-red-500/40 hover:text-red-400"
                  }`}
                >
                  <Heart className={`h-4 w-4 ${liked ? "fill-current" : ""}`} />
                  {data.showcase_likes_count}
                </button>
                <button
                  onClick={async () => {
                    const url = typeof window !== "undefined" ? window.location.href : "";
                    try {
                      if (navigator.share) {
                        await navigator.share({ title, text: desc.slice(0, 140), url });
                      } else {
                        await navigator.clipboard.writeText(url);
                        toast.success("Share link copied!");
                      }
                    } catch {
                      /* user cancelled share */
                    }
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border hover:border-primary/40 hover:text-primary-glow px-3 py-2 text-sm transition"
                  title="Share this build"
                >
                  <Share2 className="h-4 w-4" />
                  Share
                </button>
                <button
                  onClick={() => {
                    if (!user) {
                      toast.info("Sign in to remix");
                      nav({ to: "/login" });
                      return;
                    }
                    remixMut.mutate();
                  }}
                  disabled={remixMut.isPending}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                >
                  {remixMut.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <GitFork className="h-4 w-4" />
                  )}
                  Remix ({data.showcase_remix_count})
                </button>
              </div>
            </div>

            <p className="mt-6 text-foreground/90 whitespace-pre-wrap leading-relaxed">{desc}</p>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
