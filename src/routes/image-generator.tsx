import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Header, Footer } from "@/components/layout";
import { useAuth } from "@/lib/auth-context";
import {
  generateImageStudio,
  type GenerateImageResult,
} from "@/lib/image-studio.functions";
import {
  Sparkles,
  Upload,
  Download,
  Loader2,
  Image as ImageIcon,
  X,
  Wand2,
} from "lucide-react";

export const Route = createFileRoute("/image-generator")({
  component: ImageGeneratorPage,
  head: () => ({
    meta: [
      { title: "AI Image Generator — BloxSmith AI" },
      {
        name: "description",
        content:
          "Premium AI image generator. Choose between Gemini and OpenAI models, pick style, size, quality, variations, and reference images. Built for Roblox creators by BloxSmith.",
      },
      {
        name: "keywords",
        content:
          "AI image generator, Roblox AI image, Gemini image generator, gpt-image-2, AI art, BloxSmith image studio",
      },
      { property: "og:title", content: "AI Image Generator — BloxSmith AI" },
      {
        property: "og:description",
        content:
          "Generate stunning AI images with multiple models, styles, sizes, quality levels, and variations.",
      },
      { property: "og:url", content: "https://bloxsmith.pro/image-generator" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "AI Image Generator — BloxSmith AI" },
    ],
    links: [{ rel: "canonical", href: "https://bloxsmith.pro/image-generator" }],
  }),
});

type Model =
  | "google/gemini-2.5-flash-image"
  | "google/gemini-3-pro-image-preview"
  | "google/gemini-3.1-flash-image-preview"
  | "openai/gpt-image-2"
  | "openai/gpt-image-1-mini";

const MODELS: { value: Model; label: string; tag: string }[] = [
  { value: "google/gemini-3.1-flash-image-preview", label: "Gemini 3.1 Flash", tag: "Fast · Default" },
  { value: "google/gemini-3-pro-image-preview", label: "Gemini 3 Pro", tag: "Best quality" },
  { value: "google/gemini-2.5-flash-image", label: "Gemini 2.5 Flash", tag: "Legacy" },
];

const ASPECTS = ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"] as const;
const QUALITIES = ["low", "medium", "high"] as const;

const STYLES: { value: string; label: string }[] = [
  { value: "", label: "None" },
  { value: "photoreal", label: "Photoreal" },
  { value: "cinematic", label: "Cinematic" },
  { value: "anime", label: "Anime" },
  { value: "3d-render", label: "3D Render" },
  { value: "pixel", label: "Pixel Art" },
  { value: "watercolor", label: "Watercolor" },
  { value: "cyberpunk", label: "Cyberpunk" },
  { value: "minimalist", label: "Minimalist" },
  { value: "roblox", label: "Roblox" },
  { value: "logo", label: "Logo" },
];

const PRESETS = [
  "Epic Roblox sword glowing with blue flames, fantasy concept art",
  "Cute cartoon Roblox character mascot, big eyes, vibrant colors",
  "Futuristic neon arcade game thumbnail, dramatic lighting",
  "Realistic medieval castle on a floating island at sunset",
  "Holographic UI panel for a sci-fi game, glassmorphism",
];

// Roblox asset types — each sets a sensible aspect + style + prompt scaffold so
// users get the right framing for thumbnails, icons, HUD art, textures, etc.
type AssetType = {
  label: string;
  aspect: (typeof ASPECTS)[number];
  style: string;
  scaffold: string;
};
const ASSET_TYPES: AssetType[] = [
  {
    label: "Game thumbnail",
    aspect: "16:9",
    style: "roblox",
    scaffold:
      "Roblox game thumbnail, 16:9, colorful, high-energy, clickable, bold focal subject, room for title text. Theme: ",
  },
  {
    label: "Game icon",
    aspect: "1:1",
    style: "roblox",
    scaffold:
      "Roblox game icon, 1:1 square, single bold central subject, clean readable at small size. Theme: ",
  },
  {
    label: "HUD / UI graphic",
    aspect: "1:1",
    style: "minimalist",
    scaffold:
      "Roblox game HUD/UI graphic element, clean vector style, crisp edges, transparent-friendly composition. Element: ",
  },
  {
    label: "Texture / pattern",
    aspect: "1:1",
    style: "3d-render",
    scaffold:
      "Seamless tileable Roblox texture, flat top-down, even lighting, no perspective, repeatable pattern. Material: ",
  },
  {
    label: "Gamepass / ad",
    aspect: "16:9",
    style: "cinematic",
    scaffold:
      "Roblox gamepass / advertisement banner, eye-catching, premium, leaves space for text overlay. Promo for: ",
  },
  {
    label: "Decal / sticker",
    aspect: "1:1",
    style: "logo",
    scaffold:
      "Roblox decal/sticker art, bold centered subject on clean background, sticker-style outline. Subject: ",
  },
];

function ImageGeneratorPage() {
  const { user } = useAuth();
  const generate = useServerFn(generateImageStudio);
  const fileInput = useRef<HTMLInputElement>(null);

  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [model, setModel] = useState<Model>("google/gemini-3.1-flash-image-preview");
  const [aspect, setAspect] = useState<(typeof ASPECTS)[number]>("1:1");
  const [quality, setQuality] = useState<(typeof QUALITIES)[number]>("medium");
  const [variations, setVariations] = useState(1);
  const [style, setStyle] = useState("");
  const [refImage, setRefImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GenerateImageResult | null>(null);

  function applyAssetType(t: AssetType) {
    setAspect(t.aspect);
    setStyle(t.style);
    // Prefill the scaffold; keep any subject the user already typed.
    const existingSubject = prompt.includes(":")
      ? prompt.slice(prompt.lastIndexOf(":") + 1).trim()
      : prompt.trim();
    setPrompt(t.scaffold + (existingSubject || ""));
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
      toast.error("Please sign in to generate images.");
      return;
    }
    if (prompt.trim().length < 3) {
      toast.error("Describe the image you want to generate.");
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const res = await generate({
        data: {
          prompt: prompt.trim(),
          negativePrompt: negativePrompt.trim() || undefined,
          model,
          aspectRatio: aspect,
          quality,
          variations,
          stylePreset: style || undefined,
          referenceImageDataUrl: refImage ?? undefined,
        },
      });
      setResult(res);
      if (!res.ok) toast.error(res.error);
      else {
        toast.success(
          `Generated ${res.images.length} image${res.images.length > 1 ? "s" : ""}${
            res.fellBack ? " (fallback model)" : ""
          }`,
        );
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
            <Wand2 className="h-3.5 w-3.5 text-primary" />
            Multi-model AI · BloxSmith Studio
          </div>
          <h1 className="text-3xl sm:text-5xl font-bold tracking-tight">AI Image Generator</h1>
          <p className="mt-3 text-muted-foreground text-sm sm:text-base">
            Pick a model, style, size and quality. Generate up to 4 variations with optional
            reference images and negative prompts. Automatic fallback if a model is unavailable.
          </p>
        </div>

        <div className="grid lg:grid-cols-5 gap-6">
          {/* Controls */}
          <section className="lg:col-span-2 space-y-5 glass rounded-2xl p-5 sm:p-6">
            {/* Prompt */}
            <div>
              <label
                htmlFor="prompt"
                className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                Prompt
              </label>
              <div className="mt-2 mb-2 flex flex-wrap gap-1.5">
                {ASSET_TYPES.map((t) => (
                  <button
                    key={t.label}
                    type="button"
                    onClick={() => applyAssetType(t)}
                    className="rounded-full border border-primary/30 bg-primary/5 px-2.5 py-1 text-[11px] font-medium text-primary hover:bg-primary/10 transition"
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <textarea
                id="prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={4}
                maxLength={2000}
                placeholder="A glowing Roblox sword on a black background, hyper-detailed"
                className="mt-2 w-full resize-none rounded-xl border border-border bg-surface px-3 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {PRESETS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPrompt(p)}
                    className="rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] text-muted-foreground hover:border-primary/40 hover:text-foreground transition"
                  >
                    {p.split(",")[0]}
                  </button>
                ))}
              </div>
            </div>

            {/* Negative prompt */}
            <div>
              <label
                htmlFor="neg"
                className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                Negative prompt (optional)
              </label>
              <input
                id="neg"
                value={negativePrompt}
                onChange={(e) => setNegativePrompt(e.target.value)}
                maxLength={500}
                placeholder="blurry, low quality, watermark, text"
                className="mt-2 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            {/* Model */}
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Model
              </label>
              <div className="mt-2 grid grid-cols-1 gap-2">
                {MODELS.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => setModel(m.value)}
                    className={`flex items-center justify-between rounded-xl border p-2.5 text-left transition ${
                      model === m.value
                        ? "border-primary bg-primary/10 ring-2 ring-primary/30"
                        : "border-border bg-surface hover:border-primary/40"
                    }`}
                  >
                    <span className="text-sm font-medium">{m.label}</span>
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {m.tag}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Aspect + Quality + Variations */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Aspect
                </label>
                <select
                  value={aspect}
                  onChange={(e) => setAspect(e.target.value as (typeof ASPECTS)[number])}
                  className="mt-2 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none"
                >
                  {ASPECTS.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Quality
                </label>
                <select
                  value={quality}
                  onChange={(e) => setQuality(e.target.value as (typeof QUALITIES)[number])}
                  className="mt-2 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none"
                >
                  {QUALITIES.map((q) => (
                    <option key={q} value={q}>
                      {q}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Variations
                </label>
                <select
                  value={variations}
                  onChange={(e) => setVariations(Number(e.target.value))}
                  className="mt-2 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none"
                >
                  {[1, 2, 3, 4].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Style
                </label>
                <select
                  value={style}
                  onChange={(e) => setStyle(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none"
                >
                  {STYLES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Reference image */}
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
                  Upload a reference
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
                  Generate {variations > 1 ? `${variations} images` : "image"}
                </>
              )}
            </button>
            {!user && (
              <p className="text-center text-xs text-muted-foreground">
                Sign in to generate. Each variation uses image credits.
              </p>
            )}
          </section>

          {/* Preview */}
          <section className="lg:col-span-3 glass rounded-2xl p-5 sm:p-6 min-h-[420px] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Results
              </h2>
              {result?.ok && (
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {result.modelUsed}
                </span>
              )}
            </div>

            <div className="flex-1 flex items-center justify-center rounded-xl border border-border bg-surface/40 overflow-hidden">
              {loading ? (
                <div className="text-center text-muted-foreground text-sm">
                  <Loader2 className="h-8 w-8 mx-auto mb-3 animate-spin text-primary" />
                  Generating your images…
                </div>
              ) : result?.ok ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 w-full">
                  {result.images.map((img, i) => (
                    <div key={i} className="relative group">
                      <img
                        src={img.url}
                        alt={`Generated variation ${i + 1}`}
                        className="w-full rounded-lg border border-border"
                      />
                      <a
                        href={img.url}
                        download
                        className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-lg bg-background/80 backdrop-blur px-2 py-1 text-[11px] font-medium border border-border opacity-0 group-hover:opacity-100 transition"
                      >
                        <Download className="h-3 w-3" />
                        PNG
                      </a>
                    </div>
                  ))}
                </div>
              ) : result && !result.ok ? (
                <div className="max-w-md text-center p-6">
                  <p className="text-sm font-semibold text-destructive">Generation failed</p>
                  <p className="mt-2 text-xs text-muted-foreground">{result.error}</p>
                </div>
              ) : (
                <div className="text-center text-muted-foreground p-8">
                  <ImageIcon className="h-10 w-10 mx-auto mb-3 opacity-40" />
                  <p className="text-sm">Your generated images will appear here.</p>
                </div>
              )}
            </div>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
