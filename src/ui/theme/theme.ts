export type FinanceTheme = "light" | "dark" | "system";
export type ResolvedFinanceTheme = "light" | "dark";

const STORAGE_KEY = "thiepn.finance.theme";

export function resolveFinanceTheme(
  theme: FinanceTheme,
  prefersDark: boolean,
): ResolvedFinanceTheme {
  return theme === "system" ? (prefersDark ? "dark" : "light") : theme;
}

export function readStoredFinanceTheme(): FinanceTheme {
  if (typeof window === "undefined") return "system";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === "light" || stored === "dark" || stored === "system"
    ? stored
    : "system";
}

export function applyFinanceTheme(theme: FinanceTheme): ResolvedFinanceTheme {
  const prefersDark =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  const resolved = resolveFinanceTheme(theme, prefersDark);

  if (typeof document !== "undefined") {
    document.documentElement.dataset.theme = resolved;
    document.documentElement.style.colorScheme = resolved;
  }

  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, theme);
  }

  return resolved;
}

export function nextFinanceTheme(
  resolved: ResolvedFinanceTheme,
): FinanceTheme {
  return resolved === "dark" ? "light" : "dark";
}
