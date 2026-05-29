import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Header, Footer } from "@/components/layout";
import { useAuth } from "@/lib/auth-context";
import { generateClothing, type GenerateClothingResult } from "@/lib/clothing.functions";
import { Shirt, Upload, Sparkles, Download, ImageIcon, Loader2, X, Box } from "lucide-react";
import { ClothingPreview3D } from "@/components/ClothingPreview3D";

export const Route = createFileRoute("/clothing")({
  component: ClothingStudio,
  head: () => ({
    meta: [
      { title: "Roblox Clothing Generator — BloxSmith AI" },
      {
        name: "description",
        content:
          "Generate Roblox shirts, pants, hoodies, jackets, T-shirts, uniforms, and accessory concept art with BloxSmith AI. Upload a reference, type a style, get an upload-ready texture.",
      },
      {
        name: "keywords",
        content:
          "Roblox clothing generator, Roblox shirt maker, Roblox pants maker, Roblox t-shirt generator, AI Roblox clothing, Roblox texture AI, BloxSmith",
      },
      { property: "og:title", content: "Roblox Clothing Generator — BloxSmith AI" },
      {
        property: "og:description",
        content:
          "AI-powered Roblox clothing studio: shirts, pants, T-shirts, hoodies, uniforms, accessories. Upload a reference image or describe a style and get a template-ready texture.",
      },
      { property: "og:url", content: "https://bloxsmith.pro/clothing" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Roblox Clothing Generator — BloxSmith AI" },
    ],
    links: [{ rel: "canonical", href: "https://bloxsmith.pro/clothing" }],
  }),
});

type Kind = "classic_shirt" | "classic_pants" | "tshirt" | "layered_or_accessory";

const KINDS: { value: Kind; label: string; sub: string }[] = [
  { value: "classic_shirt", label: "Classic Shirt", sub: "Wraps onto avatar torso + arms" },
  { value: "classic_pants", label: "Classic Pants", sub: "Wraps onto avatar legs + waist" },
  { value: "tshirt", label: "T-Shirt", sub: "Flat square decal on torso" },
  {
    value: "layered_or_accessory",
    label: "Hoodie / Jacket / Accessory",
    sub: "Concept art for a 3D mesh item",
  },
];

const PRESETS = [
  "Black and red cyber hoodie, neon circuit lines, techwear",
  "Royal knight uniform, gold trim, navy blue, ornate crest",
  "Pastel pink streetwear set with cherry blossoms",
  "Galaxy nebula shirt, deep purple, glowing stars",
  "Neon green hacker jacket, matrix code pattern",
  "Vintage 80s retro tracksuit, teal and magenta stripes",
];

function ClothingStudio() {
  const { user } = useAuth();
  const generate = useServerFn(generateClothing);
  const fileInput = useRef<HTMLInputElement>(null);

  const [kind, setKind] = useState<Kind>("classic_shirt");
  const [style, setStyle] = useState("");
  const [refImage, setRefImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState(0);
  const [result, setResult] = useState<GenerateClothingResult | null>(null);
  const [view, setView] = useState<"flat" | "3d">("flat");

  // Rotating progress messages so the wait has real feedback.
  useEffect(() => {
    if (!loading) {
      setStage(0);
      return;
    }
    const stages = 4;
    const id = setInterval(() => setStage((s) => (s + 1) % stages), 1800);
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
          kind,
          style: style.trim(),
          referenceImageDataUrl: refImage ?? undefined,
        },
      });
      setResult(res);
      if (!res.ok) toast.error(res.error);
      else toast.success("Clothing ready — preview on the right.");
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
            Roblox Clothing Generator
          </h1>
          <p className="mt-3 text-muted-foreground text-sm sm:text-base">
            Describe a shirt, pants, T-shirt, hoodie, uniform, or accessory — or upload a
            reference image — and BloxSmith generates an upload-ready Roblox texture.
          </p>
        </div>

        <div className="grid lg:grid-cols-5 gap-6">
          {/* Controls */}
          <section className="lg:col-span-2 space-y-5 glass rounded-2xl p-5 sm:p-6">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Garment type
              </label>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {KINDS.map((k) => (
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
                {PRESETS.map((p) => (
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

            <button
              type="button"
              onClick={onGenerate}
              disabled={loading || !user}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed transition"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating…
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Generate clothing
                </>
              )}
            </button>
            {!user && (
              <p className="text-center text-xs text-muted-foreground">
                Sign in to generate. Each generation uses image credits.
              </p>
            )}
          </section>

          {/* Preview */}
          <section className="lg:col-span-3 glass rounded-2xl p-5 sm:p-6 min-h-[420px] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Preview
              </h2>
              {result && result.ok && (
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
                    onClick={() => downloadImage(result.imageUrl)}
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
                <div className="text-center text-muted-foreground text-sm">
                  <Loader2 className="h-8 w-8 mx-auto mb-3 animate-spin text-primary" />
                  {
                    [
                      "Reading your design brief…",
                      "Choosing colors and motifs…",
                      "Laying out the template panels…",
                      "Rendering your texture…",
                    ][stage]
                  }
                </div>
              ) : result && result.ok ? (
                view === "3d" ? (
                  <div className="h-[520px] w-full">
                    <ClothingPreview3D imageUrl={result.imageUrl} kind={result.kind} />
                  </div>
                ) : (
                  <img
                    src={result.imageUrl}
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
