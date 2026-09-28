/**
 * The colour theme a person has chosen.
 *
 * Kept in a readable cookie rather than localStorage so the server renders the
 * right theme on the first byte: the root layout puts it on <html> as
 * data-theme, and there is no flash of the wrong ground before a script runs.
 *
 * "system" is stored as no cookie at all. With no data-theme attribute the
 * stylesheet follows prefers-color-scheme, so the absence of a choice and the
 * choice to follow the OS are the same thing.
 *
 * Shared by the server (layout) and the browser (the switch), so nothing here
 * may touch next/headers.
 */
export const THEME_COOKIE = "aim_theme";

export type ThemePreference = "system" | "light" | "dark";

export function parseTheme(value: string | undefined | null): ThemePreference {
  return value === "light" || value === "dark" ? value : "system";
}
