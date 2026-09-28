import type { ReactNode } from "react";

export function Panel({
  title,
  hint,
  action,
  children,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="panel p-5">
      <header className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
          {hint ? <p className="mt-0.5 text-xs text-ink-400">{hint}</p> : null}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

const TONES = {
  neutral: "border-ink-700 text-ink-200",
  green: "border-signal-green/40 bg-signal-green/10 text-signal-green",
  amber: "border-signal-amber/40 bg-signal-amber/10 text-signal-amber",
  red: "border-signal-red/40 bg-signal-red/10 text-signal-red",
  blue: "border-signal-blue/40 bg-signal-blue/10 text-signal-blue",
} as const;

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: keyof typeof TONES;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 font-mono text-[11px] uppercase tracking-wide ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}

export function statusTone(status: string): keyof typeof TONES {
  switch (status) {
    case "APPROVED":
    case "ISSUED":
    case "COMPLETED":
    case "SUCCESS":
      return "green";
    case "SUBMITTED":
    case "IN_REVIEW":
    case "IN_PROGRESS":
    case "SUSPENDED":
      return "amber";
    case "RETURNED":
    case "REJECTED":
    case "REVOKED":
    case "DENIED":
    case "FAILURE":
      return "red";
    default:
      return "neutral";
  }
}

export function Stat({
  label,
  value,
  note,
  href,
  active,
}: {
  label: string;
  value: ReactNode;
  note?: string;
  /** Makes the whole tile a way through to what it counts. */
  href?: string;
  /** True when the page is already showing what this tile counts. */
  active?: boolean;
}) {
  const body = (
    <>
      <p className="rule-label">{label}</p>
      {/*
        A div, not a p: a value is sometimes a control rather than prose --
        the Academy's enrolment tile puts a form here -- and a form inside a
        paragraph is invalid HTML the browser reparents, which hydrates wrong.
      */}
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {note ? <p className="mt-0.5 text-xs text-ink-400">{note}</p> : null}
    </>
  );

  if (!href) return <div className="panel px-4 py-3">{body}</div>;

  return (
    <a
      href={href}
      aria-current={active ? "true" : undefined}
      className={`panel block px-4 py-3 transition hover:border-brass-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brass-500 ${
        active ? "border-brass-500" : ""
      }`}
    >
      {body}
    </a>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-ink-800 px-4 py-6 text-center text-xs text-ink-400">
      {children}
    </p>
  );
}

/**
 * Shown where a panel is out of scope for the signed-in role. It says so
 * plainly rather than rendering an empty list, because "you cannot see this"
 * and "there is nothing here" are different facts.
 */
export function Refused({ what }: { what: string }) {
  return (
    <p className="rounded-lg border border-dashed border-ink-800 px-4 py-6 text-center text-xs text-ink-400">
      The server refused {what} for your role.
    </p>
  );
}

/**
 * The button vocabulary.
 *
 * Two faults this exists to fix, both of them safety rather than polish.
 *
 * First, buttons were styled exactly like text inputs — the same border, the
 * same ground, the same size — so a dense authoring screen read as a wall of
 * fields with a few of them secretly clickable. A control that performs an
 * action must not look like a control that holds a value, so every variant
 * here carries a filled ground and inputs keep the recessed one.
 *
 * Second, destructive actions were distinguished only on hover: "delete" sat
 * next to "hide" and "edit" in identical grey, and turned red once the pointer
 * was already on it. Somebody reading the row had no way to tell which one
 * destroyed something. `danger` is red at rest.
 */
const BUTTON_BASE =
  "inline-flex items-center justify-center gap-1.5 font-medium transition disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brass-500";

const BUTTON_SIZE = {
  /** Row-level actions inside a dense list. */
  sm: "rounded-lg px-2.5 py-1 text-[11px]",
  /** The default for a form's own action. */
  md: "rounded-lg px-3 py-1.5 text-xs",
  /** The single action a panel exists for. */
  lg: "rounded-lg px-5 py-2.5 text-sm",
  /**
   * A single glyph. Square, so a row of them lines up, and large enough to be
   * a real pointer target — an arrow the size of its own glyph is a control
   * only somebody with a steady hand can use.
   */
  icon: "rounded-lg h-7 w-7 p-0 text-xs",
  /** The badge's own geometry, for a control that sits beside one. */
  chip: "rounded-md px-2 py-0.5 font-mono text-[11px] uppercase tracking-wide",
} as const;

const BUTTON_VARIANT = {
  /** The one thing this panel is for. At most one per panel. */
  primary: "bg-brass-500 text-ink-950 hover:bg-brass-600",
  /** Ordinary actions. Filled, so it never reads as an input. */
  secondary:
    "border border-ink-700 bg-ink-800 text-ink-100 hover:border-brass-500 hover:text-brass-500",
  /** Low emphasis, still obviously a control. */
  quiet:
    "border border-transparent bg-ink-900 text-ink-300 hover:border-ink-600 hover:text-ink-100",
  /**
   * Destroys something. Red at rest, not on hover — the person deciding
   * whether to press it is looking at it before they touch it.
   */
  danger:
    "border border-signal-red/50 bg-signal-red/10 text-signal-red hover:bg-signal-red/20",
  /**
   * Flips a piece of state, and looks like the state chip beside it.
   *
   * Shaped and set exactly like `Badge` — same border radius, same mono
   * uppercase — because that is the established way this product labels the
   * condition of a thing, and "visible or hidden" is a condition.
   *
   * It carries a filled ground where the badge is outline-only, which is the
   * whole of the difference and the point of it: a state chip is not
   * pressable, so a control that borrowed its silhouette exactly would be the
   * same confusion as before, running the other way. The fill says raised;
   * the badge stays flat.
   */
  toggle:
    "border border-ink-700 bg-ink-800 text-ink-200 hover:border-brass-500 hover:text-brass-500 aria-pressed:border-signal-amber/50 aria-pressed:bg-signal-amber/10 aria-pressed:text-signal-amber",
} as const;

export type ButtonVariant = keyof typeof BUTTON_VARIANT;
export type ButtonSize = keyof typeof BUTTON_SIZE;

export function buttonClass(
  variant: ButtonVariant = "secondary",
  size: ButtonSize = "md",
): string {
  return `${BUTTON_BASE} ${BUTTON_SIZE[size]} ${BUTTON_VARIANT[variant]}`;
}

export function Button({
  variant = "secondary",
  size = "md",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return (
    <button
      {...props}
      className={`${buttonClass(variant, size)} ${className}`.trim()}
    />
  );
}

/**
 * A link that acts as a button.
 *
 * Separate from `Button` rather than a polymorphic `as` prop, because the two
 * differ in what they are for: this navigates, that submits, and blurring the
 * distinction is how a form ends up with an anchor inside it.
 */
export function LinkButton({
  variant = "secondary",
  size = "md",
  className = "",
  ...props
}: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return (
    <a
      {...props}
      className={`${buttonClass(variant, size)} ${className}`.trim()}
    />
  );
}

/** The recessed ground a value sits in. Deliberately unlike any button. */
export const FIELD =
  "rounded-lg border border-ink-700 bg-ink-950/60 px-3 py-2 text-xs outline-none focus:border-brass-500";
export const FIELD_SM =
  "rounded-lg border border-ink-700 bg-ink-950/60 px-2 py-1.5 text-[11px] outline-none focus:border-brass-500";
