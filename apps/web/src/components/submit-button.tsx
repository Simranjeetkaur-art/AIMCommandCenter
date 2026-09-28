"use client";

import { useFormStatus } from "react-dom";
import {
  buttonClass,
  type ButtonSize,
  type ButtonVariant,
} from "@/components/ui";

/**
 * A form's submit button that cannot be pressed twice.
 *
 * Disabled for as long as its form is in flight, so a double-click sends one
 * request. Without this, a second click raced the first: a practical went to
 * the examiner twice, and a create form reported the duplicate of its own
 * first submit as a failure. Must be rendered inside the `<form>` it submits.
 */
export function SubmitButton({
  children,
  variant = "primary",
  size = "md",
  className = "",
  disabled,
  pendingLabel,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shown while the form is in flight. Defaults to the normal label. */
  pendingLabel?: React.ReactNode;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      {...props}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      className={`${buttonClass(variant, size)} ${className}`.trim()}
    >
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}
