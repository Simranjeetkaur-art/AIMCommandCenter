"use client";

import { useFormStatus } from "react-dom";
import {
  buttonClass,
  type ButtonSize,
  type ButtonVariant,
} from "@/components/ui";

/**
 * A destructive action that asks first.
 *
 * Deleting a module, a lesson or a paper was one click in a dense list of
 * near-identical rows. The server refuses the genuinely dangerous cases — it
 * will not delete a lesson somebody has progress against — but plenty of
 * deletions are permitted and still unwanted, and those are exactly the ones
 * nothing was stopping.
 *
 * `window.confirm` rather than a modal on purpose: it cannot be missed, it
 * cannot be dismissed by clicking past it, and it keeps the form a plain
 * server-action submit rather than turning the whole list into client state.
 *
 * Two guards around the question. The form's own validation runs first, so a
 * reason that is too short is refused before anybody is asked "are you sure?"
 * about a submit that was never going to happen. And while the form is in
 * flight the button is disabled, so a double-click is one action, not two.
 */
export function ConfirmButton({
  children,
  confirm,
  variant = "danger",
  size = "sm",
  className = "",
  disabled,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  /** What the person is being asked. Name the thing, not the verb. */
  confirm: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      {...props}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      onClick={(event) => {
        const form = event.currentTarget.form;
        // Invalid: let the browser's own submit refuse it and say why.
        if (form && !form.checkValidity()) return;
        if (!window.confirm(confirm)) event.preventDefault();
      }}
      className={`${buttonClass(variant, size)} ${className}`.trim()}
    >
      {children}
    </button>
  );
}
