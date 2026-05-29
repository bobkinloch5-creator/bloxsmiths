import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Header } from "@/components/layout";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import { listTemplates, installTemplate } from "@/lib/templates.functions";
import { useAuth } from "@/lib/auth-context";
import { Loader2, Download, Coins, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useState, useMemo } from "react";

export const Route = createFileRoute("/templates")({
  component: TemplatesPage,
  head: () => ({
    meta: [
      { title: "Template Store — BloxSmith" },
      {
        name: "description",
        content:
          "Browse ready-made Roblox starter kits: pet simulators, tycoons, obbies, tower defense, shops, admin panels and more. One-click install into Roblox Studio.",
      },
      { property: "og:title", content: "BloxSmith Template Store — Roblox Starter Kits" },
      {
        property: "og:description",
        content:
          "12+ production-ready Roblox systems. Clone into Studio in one click and start shipping.",
      },
      { property: "og:url", content: "https://bloxsmith.pro/templates" },
    ],
    links: [{ rel: "canonical", href: "https://bloxsmith.pro/templates" }],
  }),
});

type Tpl = {
  id: string;
  slug: string;
  name: string;
  category: string;
  description: string;
  thumbnail_url: string | null;
  credits_cost: number;
  difficulty: string;
  features: string[];
  install_count: number;
};

function TemplatesPage() {
  const { user } = useAuth();
  const nav = useNavigate();
  const list = useServerFn(listTemplates);
  const install = useServerFn(installTemplate);
  const [cat, setCat] = useState<string>("All");

  const { data, isLoading } = useQuery({
    queryKey: ["templates"],
    queryFn: () => list(),
  });

  const installMut = useMutation({
    mutationFn: (slug: string) => install({ data: { templateSlug: slug } }),
    onSuccess: (res) => {
      toast.success(`Installed ${res.name}`);
      nav({ to: "/project/$projectId", params: { projectId: res.projectId } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const templates = (data?.templates ?? []) as unknown as Tpl[];
  const categories = useMemo(
    () => ["All", ...Array.from(new Set(templates.map((t) => t.category)))],
    [templates],
  );
  const filtered = cat === "All" ? templates : templates.filter((t) => t.category === cat);

  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto max-w-7xl px-4 sm:px-6 py-10">
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold">
            Template <span className="gradient-text">Store</span>
          </h1>
          <p className="mt-2 text-muted-foreground max-w-2xl">
            Ready-made Roblox starter kits. One click installs the project, seeds your Build Agent
            task board, and gets you syncing to Studio.
          </p>
        </div>

        <div className="mb-6 flex flex-wrap gap-2">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={`rounded-full px-4 py-1.5 text-sm border transition ${
                cat === c
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border bg-surface text-muted-foreground hover:text-foreground"
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="grid place-items-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((t) => (
              <article
                key={t.id}
                className="glass rounded-2xl p-5 flex flex-col gap-3 hover:border-primary/40 transition"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-xs text-primary-glow font-semibold">{t.category}</div>
                    <h2 className="font-bold text-lg leading-tight">{t.name}</h2>
                  </div>
                  <span
                    className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                      t.credits_cost === 0
                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                        : "bg-amber-500/10 text-amber-400 border border-amber-500/30"
                    }`}
                  >
                    {t.credits_cost === 0 ? "Free" : `${t.credits_cost} credits`}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">{t.description}</p>
                <ul className="text-xs text-muted-foreground space-y-1 flex-1">
                  {(t.features ?? []).slice(0, 4).map((f) => (
                    <li key={f} className="flex items-center gap-1.5">
                      <Sparkles className="h-3 w-3 text-primary-glow shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                <div className="flex items-center justify-between pt-2 border-t border-border">
                  <span className="text-xs text-muted-foreground capitalize">{t.difficulty}</span>
                  {user ? (
                    <button
                      onClick={() => installMut.mutate(t.slug)}
                      disabled={installMut.isPending}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                    >
                      {installMut.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : t.credits_cost === 0 ? (
                        <Download className="h-3.5 w-3.5" />
                      ) : (
                        <Coins className="h-3.5 w-3.5" />
                      )}
                      Install
                    </button>
                  ) : (
                    <Link
                      to="/signup"
                      className="text-sm font-semibold text-primary-glow hover:underline"
                    >
                      Sign in to install
                    </Link>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
