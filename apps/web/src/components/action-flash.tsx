"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

// Kept in step with FLASH_REFUSED / FLASH_DONE in lib/act.ts, which is
// server-only and so cannot be imported here.
const REFUSED = "refused";
const DONE = "done";

/**
 * The outcome of the last form submit, on the page it was submitted from.
 *
 * Server actions send people back here with `?refused=` (the API's own reason
 * for declining) or `?done=` (what just happened). Rendered once, in the root
 * layout, so every form in the application gets it without each page having
 * to remember. Dismissing it drops the parameter, so a reload does not repeat it.
 */
export function ActionFlash() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const refused = params.get(REFUSED);
  const done = params.get(DONE);
  if (!refused && !done) return null;

  const dismiss = () => {
    const next = new URLSearchParams(params.toString());
    next.delete(REFUSED);
    next.delete(DONE);
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  const tone = refused
    ? "border-signal-red/40 bg-signal-red/10 text-signal-red"
    : "border-signal-green/40 bg-signal-green/10 text-signal-green";

  return (
    <div
      role={refused ? "alert" : "status"}
      className={`mx-auto mt-3 flex max-w-6xl items-start justify-between gap-3 rounded-lg border px-4 py-2.5 text-sm ${tone}`}
    >
      <p>
        {refused ? (
          <>
            <span className="font-semibold">Not done. </span>
            {refused}
          </>
        ) : (
          done
        )}
      </p>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="shrink-0 rounded px-1.5 text-base leading-none opacity-80 hover:opacity-100"
      >
        ×
      </button>
    </div>
  );
}
