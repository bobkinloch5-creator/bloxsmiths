import { createFileRoute, Link } from "@tanstack/react-router";
import { Header, Footer } from "@/components/layout";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Heart, GitFork, Sparkles, Loader2, Flame } from "lucide-react";
import { useState } from "react";
import { getTrendingShowcase } from "@/lib/showcase.functions";

export const Route = createFileRoute("/showcase")({
  component: ShowcasePage,
  head: () => ({
    meta: [
      { title: "Showcase — Community Roblox Projects Built with BloxSmith" },
      {
        name: "description",
        content:
          "Browse Roblox games and systems built by the BloxSmith community. Like your favorites, remix any project into your own workspace with one click.",
      },
      { property: "og:title", content: "BloxSmith Showcase — Community Roblox Builds" },
      {
        property: "og:description",
        content: "Like and remix Roblox projects built by other BloxSmith creators.",
      },
      { property: "og:url", content: "https://bloxsmith.pro/showcase" },
    ],
    links: [{ rel: "canonical", href: "https://bloxsmith.pro/showcase" }],
  }),
});

type ShowcaseProject = {
  id: string;
  showcase_title: string | null;
  showcase_description: string | null;
  showcase_thumbnail_url: string | null;
  showcase_likes_count: number;
  showcase_remix_count: number;
  showcase_published_at: string | null;
  name: string;
  game_type: string;
};

function ShowcasePage() {
  const [sort, setSort] = useState<"trending" | "recent" | "likes" | "remixes">("trending");
  const fetchTrending = useServerFn(getTrendingShowcase);

  const { data, isLoading } = useQuery({
    queryKey: ["showcase", sort],
    queryFn: async () => {
      if (sort === "trending") {
        const res = await fetchTrending();
        return res.items.map((p) => ({
          id: p.id,
          showcase_title: p.title,
          showcase_description: p.description,
          showcase_thumbnail_url: p.thumbnailUrl,
          showcase_likes_count: p.likes,
          showcase_remix_count: p.remixes,
          showcase_published_at: p.publishedAt,
          name: p.title,
          game_type: p.gameType,
        })) as ShowcaseProject[];
      }
      const orderCol =
        sort === "likes"
          ? "showcase_likes_count"
          : sort === "remixes"
            ? "showcase_remix_count"
            : "showcase_published_at";
      const { data, error } = await supabase
        .from("projects")
        .select(
          "id, showcase_title, showcase_description, showcase_thumbnail_url, showcase_likes_count, showcase_remix_count, showcase_published_at, name, game_type",
        )
        .eq("showcase_published", true)
        .order(orderCol, { ascending: false })
        .limit(60);
      if (error) throw error;
      return (data ?? []) as ShowcaseProject[];
    },
    staleTime: 60_000,
  });

  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto max-w-7xl px-4 sm:px-6 py-10">
        <header className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold">
            Community <span className="gradient-text">Showcase</span>
          </h1>
          <p className="mt-2 text-muted-foreground max-w-2xl">
            Real Roblox projects built by BloxSmith creators. Like what you see — or remix any
            project into your own workspace and ship your spin on it.
          </p>
        </header>

        <div className="mb-6 flex flex-wrap gap-2">
          {(["trending", "recent", "likes", "remixes"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSort(s)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border transition ${
                sort === s
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {s === "trending" && <Flame className="h-3.5 w-3.5" />}
              {s === "trending"
                ? "Trending"
                : s === "recent"
                  ? "Most Recent"
                  : s === "likes"
                    ? "Most Liked"
                    : "Most Remixed"}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (data?.length ?? 0) === 0 ? (
          <div className="rounded-xl border border-border bg-surface-elevated p-12 text-center">
            <Sparkles className="h-10 w-10 mx-auto text-primary-glow mb-3" />
            <h2 className="text-xl font-semibold">No projects yet</h2>
            <p className="text-muted-foreground mt-1">
              Be the first to publish your build to the showcase.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {data!.map((p) => (
              <Link
                key={p.id}
                to="/showcase/$projectId"
                params={{ projectId: p.id }}
                className="group rounded-xl border border-border bg-surface-elevated overflow-hidden hover:border-primary/40 hover:shadow-[var(--shadow-glow)] transition"
              >
                <div className="aspect-video bg-gradient-to-br from-primary/20 to-accent/10 grid place-items-center overflow-hidden">
                  {p.showcase_thumbnail_url ? (
                    <img
                      src={p.showcase_thumbnail_url}
                      alt={p.showcase_title ?? p.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                      loading="lazy"
                    />
                  ) : (
                    <Sparkles className="h-10 w-10 text-primary-glow/60" />
                  )}
                </div>
                <div className="p-4">
                  <h3 className="font-semibold truncate">{p.showcase_title ?? p.name}</h3>
                  <p className="text-sm text-muted-foreground line-clamp-2 mt-1 min-h-[2.5rem]">
                    {p.showcase_description ?? "—"}
                  </p>
                  <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Heart className="h-3.5 w-3.5" /> {p.showcase_likes_count}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <GitFork className="h-3.5 w-3.5" /> {p.showcase_remix_count}
                    </span>
                    <span className="ml-auto rounded-full bg-primary/10 px-2 py-0.5 text-primary-glow">
                      {p.game_type}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
