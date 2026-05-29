import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Header } from "@/components/layout";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { generateGameIdeas, IDEA_CATEGORIES } from "@/lib/ideas.functions";
import { createProject } from "@/lib/projects.functions";
import { planBuild } from "@/lib/ai.functions";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Loader2, Sparkles, Hammer, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

export const Route = createFileRoute("/ideas")({
  component: IdeasPage,
  head: () => ({
    meta: [
      { title: "Game Idea Generator — BloxSmith" },
      {
        name: "description",
        content:
          "Generate fresh, buildable Roblox game ideas across 11 categories. Each idea ships with a gameplay loop, features, monetization and a one-click Build button.",
      },
      { property: "og:title", content: "BloxSmith Game Idea Generator" },
      {
        property: "og:description",
        content: "AI-generated Roblox game ideas you can build into Studio in one click.",
      },
      { property: "og:url", content: "https://bloxsmith.pro/ideas" },
    ],
    links: [{ rel: "canonical", href: "https://bloxsmith.pro/ideas" }],
  }),
});

type Idea = {
  name: string;
  category: string;
  loop: string;
  features: string[];
  monetization: string[];
  difficulty: string;
  build_prompt: string;
};

function IdeasPage() {
  const { user } = useAuth();
  const nav = useNavigate();
  const generate = useServerFn(generateGameIdeas);
  const create = useServerFn(createProject);
  const plan = useServerFn(planBuild);
  const [category, setCategory] = useState<string>("Any");
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [buildingIdx, setBuildingIdx] = useState<number | null>(null);

  const gen = useMutation({
    mutationFn: () => {
      if (!user) throw new Error("Sign in to generate ideas.");
      return generate({
        data: {
          category: category === "Any" ? undefined : (category as (typeof IDEA_CATEGORIES)[number]),
          count: 3,
        },
      });
    },
    onSuccess: (res) => {
      setIdeas((res.ideas ?? []) as Idea[]);
      if (!res.ideas?.length) toast.error("No ideas returned — try again");
    },
    onError: (e: Error) => {
      toast.error(e.message);
      if (e.message.includes("Sign in")) nav({ to: "/login" });
    },
  });

  const buildIdea = async (idx: number, idea: Idea) => {
    if (!user) {
      toast.error("Sign in to build");
      return;
    }
    setBuildingIdx(idx);
    try {
      const proj = await create({
        data: {
          name: idea.name,
          game_type: idea.category,
          template: "blank",
          description: idea.loop,
        },
      });
      // Pre-seed a build plan so the project opens with the plan ready
      const planRes = await plan({
        data: { projectId: proj.id, prompt: idea.build_prompt, thinking: false },
      });
      await (supabase as any).from("build_plans").insert({
        project_id: proj.id,
        user_id: user.id,
        prompt: idea.build_prompt,
        plan: { source: "idea", text: planRes.plan, features: idea.features },
        status: "ready",
      });
      // Seed tasks
      if (idea.features?.length) {
        await (supabase as any).from("project_tasks").insert(
          idea.features.map((title, i) => ({
            project_id: proj.id,
            user_id: user.id,
            title,
            kind: "feature",
            status: "todo",
            position: i,
          })),
        );
      }
      toast.success("Project created with build plan!");
      nav({ to: "/project/$projectId", params: { projectId: proj.id } });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBuildingIdx(null);
    }
  };

  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto max-w-5xl px-4 sm:px-6 py-10">
        <div className="mb-8 text-center">
          <h1 className="text-3xl md:text-4xl font-bold">
            Game Idea <span className="gradient-text">Generator</span>
          </h1>
          <p className="mt-2 text-muted-foreground max-w-2xl mx-auto">
            Generate fresh, buildable Roblox concepts. Each idea ships with a one-click Build button
            that creates a project with a ready-to-execute plan.
          </p>
        </div>

        <div className="mb-6 flex flex-wrap items-center justify-center gap-2">
          {["Any", ...IDEA_CATEGORIES].map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`rounded-full px-3 py-1.5 text-sm border transition ${
                category === c
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border bg-surface text-muted-foreground hover:text-foreground"
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        <div className="text-center mb-8">
          <button
            onClick={() => gen.mutate()}
            disabled={gen.isPending}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-primary to-primary-glow px-6 py-3 text-base font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            {gen.isPending ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Sparkles className="h-5 w-5" />
            )}
            {ideas.length ? "Generate more ideas" : "Generate ideas"}
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {ideas.map((idea, i) => (
            <article key={i} className="glass rounded-2xl p-5 flex flex-col gap-3">
              <div>
                <div className="text-xs text-primary-glow font-semibold">{idea.category}</div>
                <h2 className="font-bold text-lg">{idea.name}</h2>
              </div>
              <p className="text-sm text-muted-foreground">{idea.loop}</p>
              <div className="text-xs">
                <div className="font-semibold mb-1 text-foreground">Features</div>
                <ul className="space-y-0.5 text-muted-foreground">
                  {(idea.features ?? []).slice(0, 5).map((f) => (
                    <li key={f}>• {f}</li>
                  ))}
                </ul>
              </div>
              <div className="text-xs">
                <div className="font-semibold mb-1 text-foreground">Monetization</div>
                <ul className="space-y-0.5 text-muted-foreground">
                  {(idea.monetization ?? []).slice(0, 3).map((m) => (
                    <li key={m}>• {m}</li>
                  ))}
                </ul>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-border mt-auto">
                <span className="text-xs text-muted-foreground capitalize">{idea.difficulty}</span>
                <button
                  onClick={() => buildIdea(i, idea)}
                  disabled={buildingIdx === i}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                >
                  {buildingIdx === i ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Hammer className="h-3.5 w-3.5" />
                  )}
                  Build
                </button>
              </div>
            </article>
          ))}
        </div>

        {!ideas.length && !gen.isPending && (
          <p className="text-center text-sm text-muted-foreground mt-8">
            Pick a category and hit Generate.
          </p>
        )}
      </main>
    </div>
  );
}
