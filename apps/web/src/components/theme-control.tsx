"use client";

import { useEffect, useState } from "react";
import { THEME_COOKIE, type ThemePreference } from "@/lib/theme";

/** Fired on window when any switch changes, so every copy on the page agrees. */
const THEME_EVENT = "aim:theme";

const OPTIONS: Array<[ThemePreference, string]> = [
  ["system", "System"],
  ["light", "Light"],
  ["dark", "Dark"],
];

/**
 * The switch itself. A segmented control rather than a toggle, because there
 * are three answers and "follow my computer" is the one most people want.
 *
 * Changing it rewrites data-theme on <html> directly, so the page turns over
 * at once without a round trip, and writes the cookie so the next server
 * render agrees. A page can show more than one switch (the landing page has
 * one in the header and one in the footer); each listens for the others.
 */
export function ThemeControl({ initial }: { initial: ThemePreference }) {
  const [theme, setTheme] = useState(initial);

  useEffect(() => {
    const sync = (event: Event) =>
      setTheme((event as CustomEvent<ThemePreference>).detail);
    window.addEventListener(THEME_EVENT, sync);
    return () => window.removeEventListener(THEME_EVENT, sync);
  }, []);

  function choose(next: ThemePreference) {
    window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: next }));
    const root = document.documentElement;
    if (next === "system") {
      delete root.dataset.theme;
      document.cookie = `${THEME_COOKIE}=; path=/; max-age=0; samesite=lax`;
    } else {
      root.dataset.theme = next;
      document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    }
  }

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className="inline-flex rounded-lg border border-ink-700 bg-ink-900 p-0.5 print:hidden"
    >
      {OPTIONS.map(([value, label]) => {
        const active = value === theme;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => choose(value)}
            className={`rounded-md px-2 py-1 font-mono text-[11px] uppercase tracking-wide transition ${
              active
                ? "bg-ink-800 text-brass-500"
                : "text-ink-400 hover:text-ink-100"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
