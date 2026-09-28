/**
 * The mark: an "A" drawn in two strokes on a brass tile.
 *
 * Ink on brass, the same pairing as the primary button, so it turns over with
 * the theme exactly as that button does.
 */
export function BrandMark() {
  return (
    <span
      aria-hidden="true"
      className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brass-500 text-ink-950"
    >
      <svg
        viewBox="0 0 24 24"
        className="size-5"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        focusable="false"
      >
        <path d="M5 19 12 5l7 14" />
        <path d="M8.5 13h7" />
      </svg>
    </span>
  );
}

/** The mark and the name. The name steps aside on the narrowest screens. */
export function Wordmark() {
  return (
    <span className="flex items-center gap-2.5">
      <BrandMark />
      <span className="hidden leading-tight sm:block">
        <span className="block text-sm font-semibold tracking-tight text-ink-50">
          AIM Command Center
        </span>
        <span className="block font-mono text-[10px] tracking-[0.08em] text-ink-400 uppercase">
          AIM™ Academy
        </span>
      </span>
    </span>
  );
}
