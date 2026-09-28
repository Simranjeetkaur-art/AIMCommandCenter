"use client";

import { useEffect, useState } from "react";

/**
 * Tells the reader when the page in front of them is from an older build.
 *
 * An open tab is a snapshot: deploy while somebody is reading and their tab
 * keeps showing yesterday's navigation, yesterday's buttons and yesterday's
 * copy, with nothing on screen admitting it. That has caught people out
 * repeatedly -- a menu entry that was added and "missing", a fix that was
 * shipped and "not working" -- and every time the answer was a reload nobody
 * had any reason to try.
 *
 * It offers rather than acts. Reloading out from under somebody would throw
 * away a half-typed form, which is a worse failure than the stale page it
 * would be curing, so the reader decides and the banner waits.
 *
 * Checked when the tab is looked at rather than on a timer: a backgrounded
 * tab has nobody to tell, and the moment somebody returns to it is exactly
 * when the answer matters.
 */
export function BuildWatch({ id }: { id: string }) {
  const [stale, setStale] = useState(false);

  useEffect(() => {
    if (stale) return;
    let cancelled = false;

    async function check() {
      if (document.visibilityState !== "visible") return;
      try {
        const response = await fetch("/build-id", { cache: "no-store" });
        if (!response.ok) return;
        const body = (await response.json()) as { id?: unknown };
        if (!cancelled && typeof body.id === "string" && body.id !== id) {
          setStale(true);
        }
      } catch {
        // Offline, or the server is mid-restart. Nothing to say either way:
        // this is a convenience, and it must never interrupt the page.
      }
    }

    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [id, stale]);

  if (!stale) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-4 z-50 mx-auto flex w-fit max-w-[calc(100vw-2rem)] items-center gap-3 rounded-xl border border-brass-500/50 bg-ink-900 px-4 py-2.5 text-sm shadow-xl shadow-black/20"
    >
      <span className="text-ink-200">
        This page is from an earlier version of the app.
      </span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="rounded-lg bg-brass-500 px-3 py-1.5 text-xs font-semibold text-ink-950 transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brass-500"
      >
        Reload
      </button>
      <button
        type="button"
        onClick={() => setStale(false)}
        aria-label="Dismiss"
        className="text-xs text-ink-400 hover:text-ink-100"
      >
        Not now
      </button>
    </div>
  );
}
