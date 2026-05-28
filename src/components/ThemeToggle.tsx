import { useTheme, THEMES, type Theme, type ThemeCategory } from "@/hooks/useTheme";
import { Palette, Check, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const CATEGORIES: ThemeCategory[] = ["Base", "Roblox Games", "Seasonal"];

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const active = THEMES.find((t) => t.id === theme);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    if (open) window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [open]);

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative flex h-9 w-10 sm:w-auto sm:min-w-[7.75rem] items-center justify-center sm:justify-start gap-2 rounded-xl border border-border/70 bg-surface/85 px-2 sm:px-3 shadow-[var(--shadow-card)] transition hover:bg-surface-elevated/95 active:scale-95"
        aria-label={`Change theme. Current theme: ${active?.label ?? theme}`}
        title={`Theme: ${active?.label ?? theme}`}
        aria-expanded={open}
        aria-haspopup="menu"
        type="button"
      >
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[12px] leading-none">
          {active?.emoji}
        </span>
        <Palette className="hidden h-3.5 w-3.5 text-primary-glow sm:block" />
        <span className="hidden truncate text-[12px] font-medium text-foreground/90 lg:inline">
          {active?.label}
        </span>
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-40 bg-background/45 backdrop-blur-[1px] sm:bg-transparent sm:backdrop-blur-0"
            onClick={() => setOpen(false)}
          />
          <div className="fixed inset-x-3 top-[5.75rem] z-50 max-h-[calc(100dvh-7rem)] overflow-hidden rounded-2xl border border-border/70 bg-surface-elevated/98 shadow-2xl backdrop-blur-xl animate-fade-in sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-3 sm:max-h-[28rem] sm:w-[19rem]">
            <div className="sticky top-0 z-20 flex items-center justify-between border-b border-border/60 bg-surface-elevated/98 px-4 py-3 sm:hidden">
              <div>
                <p className="text-sm font-bold">Choose theme</p>
                <p className="text-xs text-muted-foreground">Current: {active?.label ?? theme}</p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-surface/70"
                aria-label="Close theme picker"
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-[calc(100dvh-12rem)] overflow-y-auto overscroll-contain sm:max-h-[28rem]">
              {CATEGORIES.map((cat) => (
                <div key={cat}>
                  <div className="sticky top-0 z-10 border-b border-border/40 bg-surface-elevated/95 px-4 py-2 backdrop-blur-xl sm:top-0">
                    <p className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                      {cat}
                    </p>
                  </div>
                  <div className="py-1.5">
                    {THEMES.filter((t) => t.category === cat).map((t) => (
                      <button
                        key={t.id}
                        onClick={() => {
                          setTheme(t.id as Theme);
                          setOpen(false);
                        }}
                        className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-background/35 active:bg-background/45 sm:py-2.5"
                        role="menuitemradio"
                        aria-checked={theme === t.id}
                        type="button"
                      >
                        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/8 text-lg shadow-[inset_0_1px_0_oklch(1_0_0_/_0.1)] sm:h-8 sm:w-8 sm:text-base">
                          {t.emoji}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[0.98rem] font-semibold text-foreground sm:text-[0.95rem]">
                            {t.label}
                          </span>
                          <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                            {t.hint}
                          </span>
                        </span>
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center">
                          {theme === t.id && <Check className="h-4 w-4 text-primary-glow" />}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
