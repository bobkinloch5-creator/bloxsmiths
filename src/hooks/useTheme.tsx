import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Theme =
  | "dark"
  | "light"
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

const ThemeContext = createContext<{
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggle: () => void;
}>({ theme: "dark", setTheme: () => {}, toggle: () => {} });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("dark");

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
