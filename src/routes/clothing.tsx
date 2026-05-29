import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Header, Footer } from "@/components/layout";
import { useAuth } from "@/lib/auth-context";
import { generateClothing, type GenerateClothingResult } from "@/lib/clothing.functions";
import { Shirt, Upload, Sparkles, Download, ImageIcon, Loader2, X, Box } from "lucide-react";
import { ClothingPreview3D } from "@/components/ClothingPreview3D";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/clothing")({
  component: ClothingStudio,
  head: () => ({
    meta: [
      { title: "AI Roblox Clothing Generator — Make Shirts & Pants | BloxSmith" },
      {
        name: "description",
        content:
          "Create Roblox shirts, pants, hoodies, jackets, and uniform textures with BloxSmith AI. Describe a style, upload a reference design, and get an upload-ready texture template.",
      },
      {
        name: "keywords",
        content:
          "AI Roblox clothing generator, Roblox shirt maker AI, Roblox pants maker AI, Roblox t-shirt generator, Roblox texture creator, BloxSmith clothing maker",
      },
      {
        property: "og:title",
        content: "AI Roblox Clothing Generator — Make Shirts & Pants | BloxSmith",
      },
      {
        property: "og:description",
        content:
          "Create Roblox shirts, pants, hoodies, jackets, and uniform textures with BloxSmith AI. Describe a style, upload a reference design, and get an upload-ready texture template.",
      },
      { property: "og:url", content: "https://bloxsmith.pro/clothing" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      {
        name: "twitter:title",
        content: "AI Roblox Clothing Generator — Make Shirts & Pants | BloxSmith",
      },
    ],
    links: [{ rel: "canonical", href: "https://bloxsmith.pro/clothing" }],
  }),
});

type Kind =
  | "classic_shirt"
  | "classic_pants"
  | "tshirt"
  | "layered_top"
  | "layered_bottom"
  | "hat"
  | "hair"
  | "face"
  | "back"
  | "neck"
  | "waist";

type KindDef = { value: Kind; label: string; sub: string; badge?: string };
type KindGroup = { group: string; items: KindDef[] };

const KIND_GROUPS: KindGroup[] = [
  {
    group: "Classic Clothing",
    items: [
      { value: "classic_shirt", label: "Classic Shirt", sub: "Upload-ready texture · wraps onto torso + arms" },
      { value: "classic_pants", label: "Classic Pants", sub: "Upload-ready texture · wraps onto legs + waist" },
      { value: "tshirt", label: "T-Shirt", sub: "Square decal shown flat on torso front" },
    ],
  },
  {
    group: "Layered Clothing",
    items: [
      { value: "layered_top", label: "Layered Top", sub: "Hoodie, jacket, sweater, dress", badge: "Concept art" },
      { value: "layered_bottom", label: "Layered Bottom", sub: "Joggers, skirt, layered pants", badge: "Concept art" },
    ],
  },
  {
    group: "Accessories",
    items: [
      { value: "hat", label: "Hat", sub: "Head attachment", badge: "Concept art" },
      { value: "hair", label: "Hair", sub: "Hair attachment", badge: "Concept art" },
      { value: "face", label: "Face", sub: "Glasses, mask, visor", badge: "Concept art" },
      { value: "back", label: "Back", sub: "Wings, cape, backpack", badge: "Concept art" },
      { value: "neck", label: "Neck", sub: "Scarf, collar, chain", badge: "Concept art" },
      { value: "waist", label: "Waist", sub: "Belt, holster, skirt accent", badge: "Concept art" },
    ],
  },
];

const PRESETS: Record<string, string[]> = {
  "Classic Clothing": [
    "Black and red cyber hoodie graphic, neon trim, techwear",
    "Royal knight uniform, gold trim, navy blue, ornate crest",
    "Pastel pink streetwear, cherry blossom print",
    "Galaxy nebula shirt, deep purple, glowing stars",
  ],
  "Layered Clothing": [
    "Oversized neon green hoodie, glowing seams, streetwear",
    "Worn leather jacket, biker style, aged patches",
    "Floral summer dress, bright pinks and yellows",
    "Military camo jacket, tactical, dark olive green",
  ],
  Accessories: [
    "Samurai helmet, dark iron, gold horns",
    "Long flowing silver hair, fantasy RPG",
    "Gold aviator sunglasses, glossy lenses",
    "Angelic white feathered wings",
    "Crimson dragon wings, veins of fire",
    "Spiked leather belt, punk style, chrome buckle",
  ],
};

function ClothingStudio() {
  const { user, profile } = useAuth();
  const CLOTHING_COST = 2;
  const credits = profile?.credits ?? 0;
  const canAfford = !user || credits >= CLOTHING_COST;
  const generate = useServerFn(generateClothing);
  const fileInput = useRef<HTMLInputElement>(null);

  const [kind, setKind] = useState<Kind>("classic_shirt");
  const [activeGroup, setActiveGroup] = useState("Classic Clothing");
  const [style, setStyle] = useState("");
  const [refImage, setRefImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState(0);
  const [result, setResult] = useState<GenerateClothingResult | null>(null);
  const [view, setView] = useState<"flat" | "3d">("flat");

  const currentGroup = KIND_GROUPS.find((g) => g.group === activeGroup)!;
  const currentPresets = PRESETS[activeGroup] ?? [];
  const is3DMesh = result?.ok && result.kind === "layered_or_accessory";

  // Estimated total generation time (ms). Gemini flash image gen is typically
  // ~12-22s; we use this only to drive a smooth progress estimate + ETA. The bar
  // eases toward 95% over this window and snaps to 100% when the result lands, so
  // it never claims "done" before it is.
  const EST_TOTAL_MS = 18_000;
  const [progress, setProgress] = useState(0); // 0..100
  const [etaMs, setEtaMs] = useState(EST_TOTAL_MS);

  // Drive progress + ETA while loading.
  useEffect(() => {
    if (!loading) {
      setStage(0);
      setProgress(0);
      setEtaMs(EST_TOTAL_MS);
      return;
    }
    const start = Date.now();
    const id = setInterval(() => {
      const elapsed = Date.now() - start;
      // Ease-out curve toward 95% — fast at first, slows as it approaches.
      const frac = 1 - Math.exp(-elapsed / (EST_TOTAL_MS * 0.6));
      const pct = Math.min(95, Math.round(frac * 100));
      setProgress(pct);
      setEtaMs(Math.max(0, EST_TOTAL_MS - elapsed));
      // Stage messages track progress.
      setStage(pct < 25 ? 0 : pct < 55 ? 1 : pct < 80 ? 2 : 3);
    }, 200);
    return () => clearInterval(id);
  }, [loading]);

  async function downloadImage(url: string) {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = `roblox-${kind}-${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(objectUrl);
    } catch {
      // Fallback: open in a new tab if the blob fetch is blocked.
      window.open(url, "_blank");
    }
  }

  function pickReference(file: File) {
    if (file.size > 6 * 1024 * 1024) {
      toast.error("Reference image must be under 6 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setRefImage(String(reader.result));
    reader.onerror = () => toast.error("Could not read that image.");
    reader.readAsDataURL(file);
  }

  async function onGenerate() {
    if (!user) {
      toast.error("Please sign in to generate clothing.");
      return;
    }
    if (style.trim().length < 3) {
      toast.error("Describe the clothing you want (at least a few words).");
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const res = await generate({
        data: {
          kind: (kind === "classic_shirt" || kind === "classic_pants" || kind === "tshirt")
            ? kind
            : "layered_or_accessory",
          style: style.trim(),
          referenceImageDataUrl: refImage ?? undefined,
        },
      });

      if (!res.ok) {
        toast.error(res.error);
        setResult(res);
        setLoading(false);
        return;
      }

      if (res.jobId) {
        // We have a queued ComfyUI job! Poll for status updates.
        let jobDone = false;
        let pollCount = 0;
        const maxPolls = 180; // 3 minutes maximum timeout

        setStage(0); // Queued
        setProgress(5);

        while (!jobDone && pollCount < maxPolls) {
          await new Promise((resolve) => setTimeout(resolve, 1500));
          pollCount++;

          const { data: rawJob, error: pollErr } = await supabase
            .from("comfy_generation_jobs" as any)
            .select("*")
            .eq("id", res.jobId)
            .maybeSingle();

          const job = rawJob as any;

          if (pollErr) {
            console.error("Error polling job status:", pollErr);
            continue;
          }

          if (!job) {
            jobDone = true;
            const finalResult: GenerateClothingResult = {
              ok: false,
              error: "Generation job not found on server.",
            };
            setResult(finalResult);
            toast.error("Job not found.");
            break;
          }

          if (job.status === "generating") {
            setStage(1); // Generating
            setProgress(Math.min(95, 10 + pollCount * 3));
          } else if (job.status === "completed") {
            jobDone = true;
            setProgress(100);
            setEtaMs(0);

            const finalResult: GenerateClothingResult = {
              ok: true,
              imageUrl: job.output_image_url!,
              kind: res.kind,
              isClassic: res.isClassic,
              uploadTip: res.uploadTip,
              creditsSpent: res.creditsSpent,
            };
            setResult(finalResult);
            toast.success("Clothing ready — preview on the right.");
          } else if (job.status === "failed") {
            jobDone = true;
            const finalResult: GenerateClothingResult = {
              ok: false,
              error: job.error_message || "ComfyUI generation failed.",
            };
            setResult(finalResult);
            toast.error(job.error_message || "ComfyUI generation failed.");
          }
        }

        if (!jobDone) {
          const timeoutResult: GenerateClothingResult = {
            ok: false,
            error: "Job timed out. Make sure your local Comfy worker is running.",
          };
          setResult(timeoutResult);
          toast.error("Generation timed out.");
        }
      } else {
        // Fallback standard Gemini generation path
        setProgress(100);
        setEtaMs(0);
        setResult(res);
        toast.success("Clothing ready — preview on the right.");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Generation failed.";
      toast.error(msg);
      setResult({ ok: false, error: msg });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 mx-auto w-full max-w-7xl px-4 sm:px-6 py-8 sm:py-12">
        <div className="text-center max-w-2xl mx-auto mb-8 sm:mb-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs text-muted-foreground mb-3">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            Powered by Gemini · BloxSmith AI
          </div>
          <h1 className="text-3xl sm:text-5xl font-bold tracking-tight">
            Roblox Clothing & Accessories
          </h1>
          <p className="mt-3 text-muted-foreground text-sm sm:text-base">
            Generate classic shirts, pants, hoodies, hats, wings, hair, face accessories, belts and
            more. Classic clothing produces an upload-ready texture; accessories and layered items
            produce polished concept art + a complete Roblox build guide.
          </p>
        </div>

        <div className="grid lg:grid-cols-5 gap-6">
          {/* Controls */}
          <section className="lg:col-span-2 space-y-5 glass rounded-2xl p-5 sm:p-6">
            {/* Category tabs */}
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Category
              </label>
              <div className="mt-2 flex gap-1.5 flex-wrap">
                {KIND_GROUPS.map((g) => (
                  <button
                    key={g.group}
                    type="button"
                    onClick={() => {
                      setActiveGroup(g.group);
                      setKind(g.items[0].value);
                    }}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                      activeGroup === g.group
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-surface text-muted-foreground hover:border-primary/40"
                    }`}
                  >
                    {g.group}
                  </button>
                ))}
              </div>
            </div>

            {/* Item picker within active category */}
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Item type
              </label>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {currentGroup.items.map((k) => (
                  <button
                    key={k.value}
                    type="button"
                    onClick={() => setKind(k.value)}
                    className={`text-left rounded-xl border p-3 transition ${
                      kind === k.value
                        ? "border-primary bg-primary/10 ring-2 ring-primary/30"
                        : "border-border bg-surface hover:border-primary/40"
                    }`}
                  >
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <Shirt className="h-4 w-4 text-primary" />
                      {k.label}
                      {k.badge && (
                        <span className="ml-auto rounded-full bg-violet-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-violet-400">
                          {k.badge}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">{k.sub}</div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label
                htmlFor="style"
                className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                Describe your design
              </label>
              <textarea
                id="style"
                value={style}
                onChange={(e) => setStyle(e.target.value)}
                rows={4}
                maxLength={900}
                placeholder="e.g. black and red cyber hoodie, glowing neon trim, techwear"
                className="mt-2 w-full resize-none rounded-xl border border-border bg-surface px-3 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {currentPresets.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setStyle(p)}
                    className="rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] text-muted-foreground hover:border-primary/40 hover:text-foreground transition"
                  >
                    {p.split(",")[0]}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Reference image (optional)
              </label>
              <input
                ref={fileInput}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) pickReference(f);
                  e.target.value = "";
                }}
              />
              {refImage ? (
                <div className="mt-2 relative inline-block">
                  <img
                    src={refImage}
                    alt="Reference"
                    className="h-24 w-24 rounded-lg object-cover border border-border"
                  />
                  <button
                    type="button"
                    onClick={() => setRefImage(null)}
                    className="absolute -top-2 -right-2 rounded-full bg-background border border-border p-1 hover:bg-surface"
                    aria-label="Remove reference"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-surface px-3 py-4 text-sm text-muted-foreground hover:border-primary/40 hover:text-foreground transition"
                >
                  <Upload className="h-4 w-4" />
                  Upload a reference design
                </button>
              )}
            </div>

            {user && !canAfford && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-300">
                You're out of credits ({credits} left). Clothing costs {CLOTHING_COST} credits.{" "}
                <a href="/pricing" className="font-semibold underline hover:text-amber-200">
                  Get more credits
                </a>
                .
              </div>
            )}

            <button
              type="button"
              onClick={onGenerate}
              disabled={loading || !user || !canAfford}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed transition"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating…
                </>
              ) : !canAfford ? (
                <>
                  <Sparkles className="h-4 w-4" />
                  Out of credits
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Generate clothing · {CLOTHING_COST} credits
                </>
              )}
            </button>
            {user && canAfford && (
              <p className="text-center text-xs text-muted-foreground">
                You have {credits} credits. Each design costs {CLOTHING_COST}.
              </p>
            )}
            {!user && (
              <p className="text-center text-xs text-muted-foreground">
                Sign in to generate. Each generation uses image credits.
              </p>
            )}
          </section>

          {/* Preview */}
          <section className="lg:col-span-3 glass rounded-2xl p-5 sm:p-6 min-h-[420px] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Preview
                </h2>
                {is3DMesh && (
                  <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-semibold text-violet-400">
                    Concept art · use as texture reference
                  </span>
                )}
              </div>
              {result && result.ok && result.imageUrl && (
                <div className="flex items-center gap-2">
                  <div className="inline-flex rounded-lg border border-border bg-surface p-0.5">
                    <button
                      type="button"
                      onClick={() => setView("flat")}
                      className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition ${
                        view === "flat"
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <ImageIcon className="h-3.5 w-3.5" />
                      Flat
                    </button>
                    <button
                      type="button"
                      onClick={() => setView("3d")}
                      className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition ${
                        view === "3d"
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Box className="h-3.5 w-3.5" />
                      3D
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => downloadImage(result.imageUrl!)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium hover:border-primary/40"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download PNG
                  </button>
                </div>
              )}
            </div>

            <div className="flex-1 flex items-center justify-center rounded-xl border border-border bg-surface/40 overflow-hidden">
              {loading ? (
                <div className="w-full max-w-sm px-6 text-center">
                  <Loader2 className="h-7 w-7 mx-auto mb-4 animate-spin text-primary" />
                  <p className="text-sm font-medium text-foreground">
                    {
                      [
                        "Reading your design brief…",
                        "Choosing colors and motifs…",
                        "Laying out the design…",
                        "Rendering your texture…",
                      ][stage]
                    }
                  </p>
                  {/* Progress bar */}
                  <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-surface border border-border">
                    <div
                      className="h-full rounded-full bg-primary transition-[width] duration-200 ease-out"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                    <span>{progress}%</span>
                    <span>
                      {etaMs > 800
                        ? `~${Math.ceil(etaMs / 1000)}s left`
                        : "Almost done…"}
                    </span>
                  </div>
                </div>
              ) : result && result.ok ? (
                view === "3d" ? (
                  <div className="h-[360px] w-full sm:h-[460px] lg:h-[560px]">
                    <ClothingPreview3D imageUrl={result.imageUrl!} kind={result.kind} />
                  </div>
                ) : (
                  <img
                    src={result.imageUrl!}
                    alt="Generated Roblox clothing"
                    className="max-h-[520px] w-auto object-contain"
                  />
                )
              ) : result && !result.ok ? (
                <div className="max-w-md text-center p-6">
                  <p className="text-sm font-semibold text-destructive">Generation failed</p>
                  <p className="mt-2 text-xs text-muted-foreground">{result.error}</p>
                </div>
              ) : (
                <div className="text-center text-muted-foreground p-8">
                  <ImageIcon className="h-10 w-10 mx-auto mb-3 opacity-40" />
                  <p className="text-sm">Your generated clothing will appear here.</p>
                </div>
              )}
            </div>

            {result && result.ok && (
              <div className="mt-4 rounded-xl border border-border bg-surface p-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Use it in Roblox Studio
                </h3>
                <p className="mt-2 text-sm text-foreground/90">{result.uploadTip}</p>
              </div>
            )}
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
