import { useEffect } from "react";

const STYLE_ID = "bloxsmith-roblox-model-explainer-style";
const PANEL_ID = "bloxsmith-roblox-model-explainer";

const MODEL_DETAILS = [
  {
    match: ["gpt", "chatgpt", "openai"],
    name: "ChatGPT",
    badge: "Best all-around",
    description:
      "Great for Roblox game planning, Luau scripts, debugging errors, UI logic, economy systems, quests, and full feature breakdowns.",
  },
  {
    match: ["claude", "opus", "sonnet"],
    name: "Claude",
    badge: "Best for big code",
    description:
      "Best for large Roblox systems, long scripts, clean refactors, project structure, NPC logic, admin systems, and explaining complex fixes.",
  },
  {
    match: ["gemini", "flash"],
    name: "Gemini Flash",
    badge: "Fast fallback",
    description:
      "Fast for quick Roblox ideas, simple scripts, short fixes, descriptions, thumbnails prompts, and lightweight game feature generation.",
  },
  {
    match: ["groq", "llama", "mixtral", "deepseek", "qwen"],
    name: "Fast/Open Models",
    badge: "Quick drafts",
    description:
      "Useful for fast drafts, basic Luau helpers, small changes, brainstorming, and cheaper generations when you do not need the strongest model.",
  },
  {
    match: ["image", "flux", "sd", "stable", "dall", "gpt-image"],
    name: "Image Models",
    badge: "Roblox visuals",
    description:
      "Use for Roblox thumbnails, icons, badges, gamepass images, ads, UI concepts, clothing previews, and promo art.",
  },
];

function installStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
#${PANEL_ID} {
  margin-top: .75rem;
  border: 1px solid color-mix(in oklab, var(--primary) 25%, transparent);
  border-radius: 1rem;
  padding: .85rem;
  background:
    radial-gradient(circle at 15% 0%, color-mix(in oklab, var(--primary-glow) 14%, transparent), transparent 38%),
    color-mix(in oklab, var(--surface-elevated) 72%, transparent);
  box-shadow: inset 0 1px 0 color-mix(in oklab, white 8%, transparent);
}
#${PANEL_ID} .bloxsmith-model-title {
  display: flex;
  align-items: center;
  gap: .45rem;
  font-size: .78rem;
  font-weight: 900;
  color: var(--foreground);
}
#${PANEL_ID} .bloxsmith-model-grid {
  display: grid;
  gap: .55rem;
  margin-top: .65rem;
}
#${PANEL_ID} .bloxsmith-model-card {
  border: 1px solid color-mix(in oklab, var(--border) 80%, var(--primary) 10%);
  border-radius: .8rem;
  padding: .65rem;
  background: color-mix(in oklab, var(--background) 28%, transparent);
}
#${PANEL_ID} .bloxsmith-model-row {
  display: flex;
  justify-content: space-between;
  gap: .5rem;
  align-items: center;
}
#${PANEL_ID} .bloxsmith-model-name {
  font-size: .76rem;
  font-weight: 800;
  color: var(--foreground);
}
#${PANEL_ID} .bloxsmith-model-badge {
  border-radius: 999px;
  border: 1px solid color-mix(in oklab, var(--primary) 22%, transparent);
  background: color-mix(in oklab, var(--primary) 10%, transparent);
  color: var(--primary-glow);
  padding: .16rem .42rem;
  font-size: .58rem;
  font-weight: 900;
  white-space: nowrap;
}
#${PANEL_ID} .bloxsmith-model-desc {
  margin-top: .35rem;
  font-size: .68rem;
  line-height: 1.35;
  color: var(--muted-foreground);
}
@media (min-width: 720px) {
  #${PANEL_ID} .bloxsmith-model-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
`;
  document.head.appendChild(style);
}

function getVisibleModelText() {
  const fields = Array.from(document.querySelectorAll("select, button, [role='combobox'], [data-model], input"));
  return fields
    .map((el) => `${el.textContent || ""} ${(el as HTMLInputElement).value || ""}`)
    .join(" ")
    .toLowerCase();
}

function findModelArea() {
  const candidates = Array.from(document.querySelectorAll("select, [role='combobox'], button, label, div"));
  return candidates.find((el) => /model|ai model|provider|assistant/i.test(el.textContent || ""));
}

function renderPanel(activeText: string) {
  const activeDetails = MODEL_DETAILS.filter((detail) =>
    detail.match.some((keyword) => activeText.includes(keyword)),
  );
  const details = activeDetails.length ? activeDetails : MODEL_DETAILS;

  return `
    <div class="bloxsmith-model-title">🤖 Roblox AI Model Guide</div>
    <div class="bloxsmith-model-grid">
      ${details
        .map(
          (detail) => `
            <div class="bloxsmith-model-card">
              <div class="bloxsmith-model-row">
                <span class="bloxsmith-model-name">${detail.name}</span>
                <span class="bloxsmith-model-badge">${detail.badge}</span>
              </div>
              <div class="bloxsmith-model-desc">${detail.description}</div>
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

function injectModelGuide() {
  const pathname = window.location.pathname;
  const shouldShow =
    pathname.includes("project") ||
    pathname.includes("dashboard") ||
    pathname.includes("image-generator") ||
    pathname.includes("clothing") ||
    pathname.includes("mcp") ||
    /model|provider|assistant/i.test(document.body.textContent || "");
  if (!shouldShow) return;

  let panel = document.getElementById(PANEL_ID);
  const activeText = getVisibleModelText();
  if (panel) {
    panel.innerHTML = renderPanel(activeText);
    return;
  }

  const modelArea = findModelArea();
  if (!modelArea) return;
  panel = document.createElement("div");
  panel.id = PANEL_ID;
  panel.innerHTML = renderPanel(activeText);

  const container = modelArea.closest("section, form, aside, .glass, [class*='rounded']") || modelArea.parentElement;
  container?.appendChild(panel);
}

export function RobloxModelExplainer() {
  useEffect(() => {
    installStyle();
    const run = () => window.requestAnimationFrame(injectModelGuide);
    run();
    const timer = window.setTimeout(run, 350);
    const observer = new MutationObserver(run);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    window.addEventListener("popstate", run);
    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
      window.removeEventListener("popstate", run);
    };
  }, []);
  return null;
}
