import { cookies } from "next/headers";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";
import { ThemeControl } from "@/components/theme-control";

/**
 * The theme switch, already showing the current choice.
 *
 * Reads the cookie on the server so the selected segment is right in the
 * first render, instead of starting on "System" and jumping once a script
 * has looked at <html>.
 */
export async function ThemeToggle() {
  const store = await cookies();
  return <ThemeControl initial={parseTheme(store.get(THEME_COOKIE)?.value)} />;
}
