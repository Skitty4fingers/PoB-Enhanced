import { useSyncExternalStore } from "react";

// UI themes. Each theme re-points the Tailwind colour tokens from index.css via a `data-theme` attribute on <html>;
// the "ascendancy" theme also sets `--accent` from the current build's ascendancy.

export type ThemeId = "ascendancy" | "classic" | "frost" | "ember" | "verdant" | "void";

export const THEMES: { id: ThemeId; label: string; swatch: string }[] = [
  { id: "ascendancy", label: "Match ascendancy", swatch: "conic-gradient(#e06573, #e0be65, #65ace0, #8465e0, #e06573)" },
  { id: "classic", label: "Classic gold", swatch: "#c8a24a" },
  { id: "frost", label: "Frost", swatch: "#7fb5e6" },
  { id: "ember", label: "Ember", swatch: "#e07a3a" },
  { id: "verdant", label: "Verdant", swatch: "#6fbf73" },
  { id: "void", label: "Void", swatch: "#a07bd0" },
];

/** Accent per class/ascendancy: the dominant hue of its tree background art, evened out to one brightness. */
export const ASCENDANCY_ACCENTS: Record<string, string> = {
  "Abyssal Lich": "#c0e065", "Acolyte of Chayula": "#e0659a", Amazon: "#e09b65", "Blood Mage": "#e0c265",
  Chronomancer: "#7365e0", Deadeye: "#6588e0", "Disciple of Varashta": "#e08365", Druid: "#e0ac65",
  Duelist: "#e0be65", "Gemling Legionnaire": "#e09965", Huntress: "#65ace0", Infernalist: "#e07265",
  Invoker: "#e08365", Lich: "#6582e0", Marauder: "#e0be65", "Martial Artist": "#659be0", Mercenary: "#e08465",
  Monk: "#6583e0", Oracle: "#e06573", Pathfinder: "#6599e0", Ranger: "#bee065", Ritualist: "#6596e0",
  Shadow: "#e0be65", Shaman: "#e06f65", "Smith of Kitava": "#e0656d", Sorceress: "#e06d65", "Spirit Walker": "#d665e0",
  Stormweaver: "#8465e0", Tactician: "#e09c65", Templar: "#e0be65", Titan: "#e09465", Warbringer: "#e08365",
  Warrior: "#e07265", Witch: "#8365e0", Witchhunter: "#65c3e0",
};

export interface ThemeSettings {
  theme: ThemeId;
  /** Faint ascendancy artwork behind the UI. */
  backdrop: boolean;
}

const KEY = "pob2.theme";
const DEFAULTS: ThemeSettings = { theme: "ascendancy", backdrop: true };

function read(): ThemeSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<ThemeSettings> | null;
    if (saved && THEMES.some((t) => t.id === saved.theme)) return { ...DEFAULTS, ...saved };
  } catch {
    // Storage blocked or corrupt: fall back to the defaults.
  }
  return DEFAULTS;
}

let current = read();
const listeners = new Set<() => void>();
document.documentElement.dataset.theme = current.theme;

export function setThemeSettings(change: Partial<ThemeSettings>) {
  current = { ...current, ...change };
  document.documentElement.dataset.theme = current.theme;
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // Not persisted; the choice still applies for this page.
  }
  listeners.forEach((l) => l());
}

export function useThemeSettings(): ThemeSettings {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    () => current,
  );
}

/** Point the "ascendancy" theme's accent at the build's ascendancy (or its base class before ascending). */
export function setAccentFor(ascendClassName?: string, className?: string) {
  const accent = (ascendClassName && ASCENDANCY_ACCENTS[ascendClassName]) || (className && ASCENDANCY_ACCENTS[className]);
  const style = document.documentElement.style;
  if (accent) style.setProperty("--accent", accent);
  else style.removeProperty("--accent");
}
