import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import bloxsmithThemeBg from "@/assets/theme-bloxsmith.svg";

export type Theme =
  | "dark"
  | "light"
  | "bloxsmith"
  | "neon"
  | "obby"
  | "tycoon"
  | "rpg"
  | "doors"
  | "bedwars"
  | "bloxfruits"
  | "adoptme"
  | "halloween"
  | "christmas"
  | "winter"
  | "summer";

export type ThemeCategory = "Base" | "Roblox Games" | "Seasonal";

export const THEMES: {
  id: Theme;
  label: string;
  emoji: string;
  hint: string;
  category: ThemeCategory;
}[] = [
  { id: "dark", label: "Obsidian", emoji: "🌑", hint: "Default dark builder", category: "Base" },
  { id: "light", label: "Daylight", emoji: "☀️", hint: "Studio daylight", category: "Base" },
  {
    id: "bloxsmith",
    label: "BloxSmith",
    emoji: "⚒️",
    hint: "Official neon AI builder background",
    category: "Base",
  },
  {
    id: "neon",
    label: "Neon Arcade",
    emoji: "💜",
    hint: "Cyberpunk purple + cyan",
    category: "Roblox Games",
  },
  {
    id: "obby",
    label: "Obby",
    emoji: "🟧",
    hint: "Bright candy primaries",
    category: "Roblox Games",
  },
  {
    id: "tycoon",
    label: "Tycoon",
    emoji: "💰",
    hint: "Money green + gold",
    category: "Roblox Games",
  },
  {
    id: "rpg",
    label: "RPG Dark",
    emoji: "🗡️",
    hint: "Dungeon ember + steel",
    category: "Roblox Games",
  },
  {
    id: "doors",
    label: "Doors",
    emoji: "🚪",
    hint: "Horror hotel amber glow",
    category: "Roblox Games",
  },
  {
    id: "bedwars",
    label: "BedWars",
    emoji: "🛏️",
    hint: "Icy sky PvP cyan",
    category: "Roblox Games",
  },
  {
    id: "bloxfruits",
    label: "Blox Fruits",
    emoji: "🍊",
    hint: "Anime pirate sunset",
    category: "Roblox Games",
  },
  {
    id: "adoptme",
    label: "Adopt Me",
    emoji: "🐾",
    hint: "Pastel pink dreamy",
    category: "Roblox Games",
  },
  {
    id: "halloween",
    label: "Halloween",
    emoji: "🎃",
    hint: "Pumpkin orange + purple",
    category: "Seasonal",
  },
  {
    id: "christmas",
    label: "Christmas",
    emoji: "🎄",
    hint: "Festive red + green",
    category: "Seasonal",
  },
  { id: "winter", label: "Winter", emoji: "❄️", hint: "Icy aurora snow", category: "Seasonal" },
  {
    id: "summer",
    label: "Summer",
    emoji: "🏖️",
    hint: "Tropical beach sunset",
    category: "Seasonal",
  },
];

const ALL_CLASSES = THEMES.map((t) => t.id);

const BLOXSMITH_THEME_STYLE_ID = "bloxsmith-official-theme-style";

function installBloxsmithThemeCss() {
  if (typeof document === "undefined") return;
  if (document.getElementById(BLOXSMITH_THEME_STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = BLOXSMITH_THEME_STYLE_ID;
  style.textContent = `
html.bloxsmith {
  --background: oklch(0.075 0.026 262);
  --foreground: oklch(0.985 0.012 200);
  --surface: oklch(0.135 0.04 260);
  --surface-elevated: oklch(0.19 0.065 258);
  --card: oklch(0.13 0.045 260 / 0.84);
  --card-foreground: oklch(0.985 0.012 200);
  --popover: oklch(0.15 0.05 260);
  --popover-foreground: oklch(0.985 0.012 200);
  --primary: oklch(0.78 0.19 215);
  --primary-foreground: oklch(0.08 0.025 260);
  --primary-glow: oklch(0.88 0.16 190);
  --secondary: oklch(0.24 0.075 270);
  --secondary-foreground: oklch(0.98 0.012 200);
  --muted: oklch(0.22 0.055 260);
  --muted-foreground: oklch(0.80 0.055 220);
  --accent: oklch(0.70 0.24 295);
  --accent-foreground: oklch(0.99 0.008 250);
  --destructive: oklch(0.64 0.25 25);
  --destructive-foreground: oklch(0.99 0.005 250);
  --success: oklch(0.82 0.21 165);
  --success-foreground: oklch(0.08 0.025 165);
  --border: oklch(0.88 0.16 200 / 0.18);
  --input: oklch(1 0 0 / 0.09);
  --ring: oklch(0.78 0.19 215);
  --sidebar: oklch(0.10 0.035 262);
  --sidebar-foreground: oklch(0.98 0.012 200);
  --sidebar-primary: oklch(0.78 0.19 215);
  --sidebar-primary-foreground: oklch(0.08 0.025 260);
  --sidebar-accent: oklch(0.21 0.065 268);
  --sidebar-accent-foreground: oklch(0.98 0.012 200);
  --sidebar-border: oklch(0.88 0.16 200 / 0.14);
  --sidebar-ring: oklch(0.78 0.19 215);
  --gradient-hero: linear-gradient(135deg, oklch(0.08 0.03 262), oklch(0.17 0.085 265) 50%, oklch(0.22 0.10 210));
  --gradient-brand: linear-gradient(135deg, var(--primary), var(--primary-glow) 48%, var(--accent));
  --gradient-surface: linear-gradient(180deg, oklch(0.18 0.055 260 / 0.84), oklch(0.10 0.035 265 / 0.55));
  --gradient-text-premium: linear-gradient(120deg, #ffffff 0%, #8befff 36%, #9a6cff 68%, #ffffff 100%);
  --shadow-glow: 0 0 90px -12px oklch(0.78 0.19 215 / 0.62);
  --shadow-glow-strong: 0 0 120px -12px oklch(0.78 0.19 215 / 0.58), 0 0 42px -8px oklch(0.70 0.24 295 / 0.45);
}
html.bloxsmith body {
  background-color: transparent;
  background-image: none !important;
}
html.bloxsmith body::before,
html.bloxsmith body::after {
  display: none !important;
}
html.bloxsmith::before {
  content: "";
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background-image: url("${bloxsmithThemeBg}");
  background-size: cover;
  background-position: center center;
  background-repeat: no-repeat;
  opacity: 0.34;
}
html.bloxsmith::after {
  content: "";
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background:
    linear-gradient(180deg, var(--background) 0%, transparent 18%, transparent 68%, var(--background) 100%),
    radial-gradient(ellipse at center, oklch(0.075 0.026 262 / 0.45) 0%, var(--background) 100%);
  opacity: 0.86;
}
html.bloxsmith body > * {
  position: relative;
  z-index: 1;
}
html.bloxsmith .hero-bg-img {
  display: none;
}
html.bloxsmith .glass,
html.bloxsmith .glass-strong {
  background: linear-gradient(180deg, oklch(0.09 0.02 260 / 0.9), oklch(0.08 0.018 260 / 0.76));
  border-color: oklch(0.88 0.16 200 / 0.18);
  box-shadow: 0 1px 0 0 oklch(1 0 0 / 0.08) inset, 0 22px 60px -26px oklch(0 0 0 / 0.75), 0 0 38px -18px oklch(0.78 0.19 215 / 0.45);
}
html.bloxsmith .premium-card:hover {
  border-color: oklch(0.88 0.16 200 / 0.46);
  box-shadow: var(--shadow-elegant), 0 0 56px -16px oklch(0.78 0.19 215 / 0.52);
}
`;
  document.head.appendChild(style);
}

const ThemeContext = createContext<{
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggle: () => void;
}>({ theme: "dark", setTheme: () => {}, toggle: () => {} });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("dark");

  useEffect(() => {
    installBloxsmithThemeCss();
  }, []);

  useEffect(() => {
    const saved = window.localStorage.getItem("bs_theme") as Theme | null;
    if (saved && ALL_CLASSES.includes(saved)) {
      setThemeState(saved);
    }
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    ALL_CLASSES.forEach((c) => root.classList.remove(c));
    root.classList.add(theme);
    root.style.colorScheme =
      theme === "light" || theme === "summer" || theme === "winter" || theme === "adoptme"
        ? "light"
        : "dark";
    window.localStorage.setItem("bs_theme", theme);
  }, [theme]);

  const toggle = () =>
    setThemeState((t) => {
      const i = ALL_CLASSES.indexOf(t);
      return ALL_CLASSES[(i + 1) % ALL_CLASSES.length];
    });

  return (
    <ThemeContext.Provider value={{ theme, setTheme: setThemeState, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
