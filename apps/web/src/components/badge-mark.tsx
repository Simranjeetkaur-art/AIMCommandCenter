const TONE_CLASS: Record<string, string> = {
  brass: "text-brass-500 border-brass-500/40 bg-brass-500/10",
  green: "text-signal-green border-signal-green/40 bg-signal-green/10",
  amber: "text-signal-amber border-signal-amber/40 bg-signal-amber/10",
  red: "text-signal-red border-signal-red/40 bg-signal-red/10",
  blue: "text-signal-blue border-signal-blue/40 bg-signal-blue/10",
  neutral: "text-ink-400 border-ink-800 bg-ink-900/60",
};

const SIZES = {
  sm: "h-9 w-9 text-[11px]",
  md: "h-14 w-14 text-sm",
  lg: "h-20 w-20 text-base",
};

/**
 * Badge artwork.
 *
 * The SVG is sanitised on the way into the database by an allow-list, so what
 * renders here is known markup with no script, handler or remote reference.
 * It draws with `currentColor`, which is how one uploaded shape can carry the
 * tone an author chose without the artwork having to know about the palette.
 */
export function BadgeMark({
  iconSvg,
  iconText,
  tone = "brass",
  size = "md",
  held = true,
  title,
}: {
  iconSvg?: string | null;
  iconText?: string | null;
  tone?: string;
  size?: keyof typeof SIZES;
  held?: boolean;
  title?: string;
}) {
  const toneClass = held
    ? (TONE_CLASS[tone] ?? TONE_CLASS.brass)
    : TONE_CLASS.neutral;

  return (
    <span
      role="img"
      aria-label={title ? `${title} badge` : "badge"}
      title={title}
      className={`inline-flex shrink-0 items-center justify-center rounded-xl border font-semibold ${SIZES[size]} ${toneClass} ${
        held ? "" : "opacity-45 grayscale"
      }`}
    >
      {iconSvg ? (
        <span
          className="block h-3/5 w-3/5 [&>svg]:h-full [&>svg]:w-full"
          dangerouslySetInnerHTML={{ __html: iconSvg }}
        />
      ) : (
        <span>{iconText || "★"}</span>
      )}
    </span>
  );
}
