export const THEMES = ["green", "paper", "terminal", "jewel"] as const;
export type Theme = (typeof THEMES)[number];

export const DEFAULT_THEME: Theme = "green";

export function isValidTheme(value: unknown): value is Theme {
  return typeof value === "string" && (THEMES as readonly string[]).includes(value);
}

export function themeMode(theme: Theme): "light" | "dark" {
  return theme === "paper" ? "light" : "dark";
}

export const THEME_LABELS: Record<Theme, string> = {
  green: "Modernized Green",
  paper: "Ink & Paper",
  terminal: "Amber Terminal",
  jewel: "Deep Jewel-tone",
};

export const THEME_ACCENT: Record<Theme, string> = {
  green: "#24c17e",
  paper: "#3454d1",
  terminal: "#ffab4a",
  jewel: "#ef6fa0",
};

export const THEME_DESCRIPTIONS: Record<Theme, string> = {
  green: "Verdillian's green, more saturated, on near-black. The default.",
  paper: "Warm paper background, near-black ink, a cobalt accent. Calm and editorial.",
  terminal: "Near-black with a warm amber accent, monospace throughout. Sharp and confident.",
  jewel: "Deep plum against near-black, with a rose accent. The boldest of the four.",
};
