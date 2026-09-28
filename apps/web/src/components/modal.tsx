"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { buttonClass, type ButtonSize, type ButtonVariant } from "./ui";

/**
 * A panel that opens over the page, for material that explains rather than
 * material that is the work.
 *
 * Built on the native `<dialog>` rather than a positioned div: escape to
 * close, the focus trap and the inert background come from the element
 * itself, and an explanation nobody can get out of with the keyboard is worse
 * than no explanation.
 */
export function Modal({
  label,
  title,
  hint,
  variant = "secondary",
  size = "sm",
  className = "",
  children,
}: {
  /** What the trigger says. */
  label: ReactNode;
  title: string;
  hint?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`${buttonClass(variant, size)} ${className}`.trim()}
      >
        {label}
      </button>

      <dialog
        ref={ref}
        onClose={() => setOpen(false)}
        /* Clicking the backdrop is the same gesture as pressing escape. */
        onClick={(event) => {
          if (event.target === ref.current) setOpen(false);
        }}
        /* `m-auto` is not decoration: a native dialog centres itself with
           `margin: auto`, and Tailwind's preflight zeroes it, which pins the
           panel to the top-left corner of the viewport. */
        className="m-auto max-h-[85dvh] w-[min(56rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-ink-700 bg-ink-900 p-0 text-ink-50 backdrop:bg-ink-950/80 backdrop:backdrop-blur-sm"
      >
        <div className="flex max-h-[85dvh] flex-col">
          <header className="flex items-start justify-between gap-4 border-b border-ink-800 px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
              {hint ? (
                <p className="mt-0.5 text-xs text-ink-400">{hint}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className={buttonClass("quiet", "sm")}
            >
              Close
            </button>
          </header>

          <div className="overflow-y-auto px-5 py-4">{children}</div>
        </div>
      </dialog>
    </>
  );
}

/** A heading and body inside explanatory material, used by the help panels. */
export function HelpBlock({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-ink-800 px-4 py-3">
      <h3 className="text-xs font-semibold tracking-tight text-brass-500">
        {title}
      </h3>
      <div className="mt-1.5 space-y-2 text-xs leading-relaxed text-ink-200">
        {children}
      </div>
    </div>
  );
}

/** A formula, set apart from the prose that explains it. */
export function Formula({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-md border border-brass-500/30 bg-brass-500/5 px-3 py-2 text-center font-mono text-xs text-brass-500">
      {children}
    </p>
  );
}
