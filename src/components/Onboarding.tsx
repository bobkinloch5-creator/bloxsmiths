import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Sparkles, Plug, Rocket, ArrowRight, X, Check, Gamepad2 } from "lucide-react";

const KEY = "bloxsmith.onboarded.v1";

type Step = {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
  cta: { label: string; href?: string; external?: string };
};

const STEPS: Step[] = [
  {
    icon: Sparkles,
    title: "Welcome to BloxSmith 👋",
    body: "Describe your game in plain English and BloxSmith generates scripts, UI, and full systems straight into Roblox Studio. You start with 150 free credits, plus 10 free daily and promo codes.",
    cta: { label: "Show me how" },
  },
  {
    icon: Plug,
    title: "Step 1 — Install the plugin",
    body: "Download the BloxSmith Studio plugin and paste your token. This is how generated code streams into Studio in real time.",
    cta: { label: "Open plugin setup", href: "/plugin" },
  },
  {
    icon: Gamepad2,
    title: "Step 2 — Open Roblox Studio",
    body: "Launch Roblox Studio so the plugin can connect. Keep it open in the background while you chat with BloxSmith on the web.",
    cta: { label: "Open Roblox Studio", external: "roblox-studio:" },
  },
  {
    icon: Rocket,
    title: "Step 3 — Build your first game",
    body: "Pick a template or start blank, then chat with BloxSmith. It'll build folders, RemoteEvents, scripts and GUI for you automatically.",
    cta: { label: "Let's build" },
  },
];

export function Onboarding({
  force = false,
  onClose,
}: { force?: boolean; onClose?: () => void } = {}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (force) {
      setOpen(true);
      setStep(0);
      return;
    }
    if (!localStorage.getItem(KEY)) setOpen(true);
  }, [force]);

  const dismiss = () => {
    if (typeof window !== "undefined") localStorage.setItem(KEY, "1");
    setOpen(false);
    onClose?.();
  };

  const next = () => {
    if (step < STEPS.length - 1) setStep(step + 1);
    else dismiss();
  };

  if (!open) return null;

  const S = STEPS[step];
  const Icon = S.icon;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      onClick={dismiss}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl animate-in zoom-in-95 slide-in-from-bottom-4 duration-300"
      >
        {/* Glow bg */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full opacity-40 blur-3xl"
          style={{
            background:
              "var(--gradient-primary, linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary))))",
          }}
        />
        <button
          onClick={dismiss}
          className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
          aria-label="Skip onboarding"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="relative p-6">
          <div className="mb-5 flex items-center gap-2">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                  i === step
                    ? "bg-gradient-to-r from-primary to-primary-glow"
                    : i < step
                      ? "bg-primary/50"
                      : "bg-border"
                }`}
              />
            ))}
          </div>

          <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary-glow/10 ring-1 ring-primary/30">
            <Icon className="h-5 w-5 text-primary" />
          </div>

          <h2 className="text-xl font-semibold tracking-tight">{S.title}</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{S.body}</p>

          <div className="mt-6 flex items-center justify-between">
            <button
              onClick={dismiss}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Skip tour
            </button>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {step + 1} / {STEPS.length}
              </span>
              {S.cta.href ? (
                <Link
                  to={S.cta.href}
                  onClick={dismiss}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-primary to-primary-glow px-4 py-2 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 hover:opacity-90 transition-opacity"
                >
                  {S.cta.label}
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              ) : S.cta.external ? (
                <a
                  href={S.cta.external}
                  onClick={() => setTimeout(next, 250)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-primary to-primary-glow px-4 py-2 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 hover:opacity-90 transition-opacity"
                >
                  {S.cta.label}
                  <ArrowRight className="h-3.5 w-3.5" />
                </a>
              ) : (
                <button
                  onClick={next}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-primary to-primary-glow px-4 py-2 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 hover:opacity-90 transition-opacity"
                >
                  {step === STEPS.length - 1 ? (
                    <>
                      <Check className="h-3.5 w-3.5" />
                      {S.cta.label}
                    </>
                  ) : (
                    <>
                      {S.cta.label}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
