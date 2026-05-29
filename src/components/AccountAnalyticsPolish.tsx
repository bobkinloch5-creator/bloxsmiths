import { useEffect } from "react";

const STYLE_ID = "bloxsmith-account-analytics-polish-style";
const SECTION_CLASS = "bloxsmith-usage-analytics-polished";

function installStyle() {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
.${SECTION_CLASS} {
  position: relative;
  overflow: hidden;
  border-radius: 1.5rem !important;
  border-color: color-mix(in oklab, var(--primary) 30%, transparent) !important;
  background:
    radial-gradient(circle at 18% 8%, color-mix(in oklab, var(--primary-glow) 22%, transparent), transparent 34%),
    radial-gradient(circle at 82% 18%, color-mix(in oklab, var(--accent) 18%, transparent), transparent 34%),
    linear-gradient(135deg, color-mix(in oklab, var(--surface-elevated) 82%, transparent), color-mix(in oklab, var(--surface) 72%, transparent)) !important;
  box-shadow:
    0 24px 80px -36px color-mix(in oklab, var(--primary) 55%, transparent),
    inset 0 1px 0 color-mix(in oklab, white 10%, transparent) !important;
}
.${SECTION_CLASS}::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    linear-gradient(90deg, transparent, color-mix(in oklab, var(--primary-glow) 10%, transparent), transparent),
    repeating-linear-gradient(90deg, color-mix(in oklab, white 5%, transparent) 0 1px, transparent 1px 80px);
  mask-image: linear-gradient(to bottom, black, transparent 72%);
  opacity: 0.55;
}
.${SECTION_CLASS} > * {
  position: relative;
  z-index: 1;
}
.${SECTION_CLASS} h2 {
  font-size: clamp(1.25rem, 2vw, 1.65rem) !important;
  letter-spacing: -0.035em;
}
.${SECTION_CLASS} h2::after {
  content: "Live profile dashboard";
  margin-left: 0.65rem;
  vertical-align: middle;
  display: inline-flex;
  border: 1px solid color-mix(in oklab, var(--success) 35%, transparent);
  background: color-mix(in oklab, var(--success) 12%, transparent);
  color: var(--success);
  border-radius: 999px;
  padding: 0.22rem 0.55rem;
  font-size: 0.62rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.${SECTION_CLASS} [class*="grid-cols-1"][class*="sm:grid-cols-3"] > div {
  position: relative;
  overflow: hidden;
  border-radius: 1rem !important;
  background:
    linear-gradient(180deg, color-mix(in oklab, var(--surface-elevated) 55%, transparent), color-mix(in oklab, var(--background) 18%, transparent)) !important;
  border-color: color-mix(in oklab, var(--border) 70%, var(--primary) 16%) !important;
  box-shadow: inset 0 1px 0 color-mix(in oklab, white 8%, transparent);
  transition: transform 180ms ease, border-color 180ms ease, box-shadow 180ms ease;
}
.${SECTION_CLASS} [class*="grid-cols-1"][class*="sm:grid-cols-3"] > div:hover {
  transform: translateY(-3px);
  border-color: color-mix(in oklab, var(--primary-glow) 42%, transparent) !important;
  box-shadow: 0 18px 48px -30px color-mix(in oklab, var(--primary) 70%, transparent);
}
.${SECTION_CLASS} [class*="grid-cols-1"][class*="sm:grid-cols-3"] > div::after {
  content: "";
  position: absolute;
  right: -28px;
  top: -28px;
  width: 82px;
  height: 82px;
  border-radius: 999px;
  background: color-mix(in oklab, var(--primary-glow) 15%, transparent);
  filter: blur(2px);
}
.${SECTION_CLASS} .recharts-wrapper,
.${SECTION_CLASS} .recharts-surface {
  overflow: visible;
}
.${SECTION_CLASS} [class*="lg:col-span-8"],
.${SECTION_CLASS} [class*="lg:col-span-4"],
.${SECTION_CLASS} table {
  border-color: color-mix(in oklab, var(--border) 70%, var(--primary) 12%) !important;
}
.${SECTION_CLASS} [class*="lg:col-span-8"],
.${SECTION_CLASS} [class*="lg:col-span-4"] {
  background: color-mix(in oklab, var(--background) 28%, transparent) !important;
  backdrop-filter: blur(14px);
  box-shadow: inset 0 1px 0 color-mix(in oklab, white 7%, transparent);
}
.${SECTION_CLASS} table thead tr {
  background: linear-gradient(90deg, color-mix(in oklab, var(--primary) 14%, transparent), color-mix(in oklab, var(--accent) 10%, transparent)) !important;
}
.${SECTION_CLASS} table tbody tr:hover {
  background: color-mix(in oklab, var(--primary) 9%, transparent) !important;
}
.${SECTION_CLASS} table span.rounded {
  border-radius: 999px !important;
  border-color: color-mix(in oklab, var(--primary-glow) 35%, transparent) !important;
  background: color-mix(in oklab, var(--primary) 13%, transparent) !important;
}
@media (max-width: 640px) {
  .${SECTION_CLASS} {
    padding: 1rem !important;
  }
  .${SECTION_CLASS} h2::after {
    margin-left: 0;
    margin-top: 0.5rem;
    display: flex;
    width: fit-content;
  }
  .${SECTION_CLASS} table {
    min-width: 680px;
  }
}
`;
  document.head.appendChild(style);
}

function polishAnalytics() {
  if (typeof document === "undefined") return;
  if (window.location.pathname !== "/account") return;

  const heading = Array.from(document.querySelectorAll("h2")).find((h2) =>
    h2.textContent?.includes("AI Usage & Spend Analytics"),
  );
  const section = heading?.closest("section");
  if (!section) return;
  section.classList.add(SECTION_CLASS);

  section.querySelectorAll("span").forEach((span) => {
    if (span.textContent?.includes("gemini-3.1-pro") || span.textContent?.includes("gemini-pro")) {
      span.textContent = "gemini-3-flash";
    }
  });
}

export function AccountAnalyticsPolish() {
  useEffect(() => {
    installStyle();

    const run = () => window.requestAnimationFrame(polishAnalytics);
    run();
    const timer = window.setTimeout(run, 250);
    const observer = new MutationObserver(run);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
    };
  }, []);

  return null;
}
