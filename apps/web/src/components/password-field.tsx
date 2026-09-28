"use client";

import {
  useCallback,
  useId,
  useState,
  type ChangeEvent,
  type InputHTMLAttributes,
  type Ref,
} from "react";
import { evaluatePassword, type PasswordSubject } from "@aim/contracts";
import { CheckIcon, CrossIcon, EyeIcon, EyeOffIcon } from "@/components/icons";

/** The sign-in form's own field, with room on the right for the eye. */
const INPUT =
  "w-full rounded-lg border border-ink-700 bg-ink-950/60 py-2.5 pr-11 pl-3 text-sm outline-none focus:border-brass-500";

/**
 * A password input with a way to see what has been typed.
 *
 * Masked by default, as a password field should be. The eye shows it for as
 * long as somebody wants to check it, which is the one mistake a masked field
 * otherwise makes invisible. The button is `type="button"`, so pressing it
 * never submits the form it sits in.
 */
export function PasswordInput({
  ref,
  className = "",
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  ref?: Ref<HTMLInputElement>;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        {...props}
        ref={ref}
        type={visible ? "text" : "password"}
        className={`${INPUT} ${className}`.trim()}
      />
      <button
        type="button"
        onClick={() => setVisible((shown) => !shown)}
        aria-label="Show password"
        aria-pressed={visible}
        aria-controls={props.id}
        title={visible ? "Hide password" : "Show password"}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-ink-400 transition hover:text-brass-500 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brass-500"
      >
        {visible ? (
          <EyeOffIcon className="size-[18px]" />
        ) : (
          <EyeIcon className="size-[18px]" />
        )}
      </button>
    </div>
  );
}

type RuleState = "idle" | "met" | "unmet";

const LINE: Record<RuleState, string> = {
  idle: "text-ink-400",
  met: "text-signal-green",
  unmet: "text-signal-red",
};

const MARK: Record<RuleState, string> = {
  idle: "border border-ink-600",
  met: "bg-signal-green/15 text-signal-green",
  unmet: "bg-signal-red/15 text-signal-red",
};

/**
 * The rules, ticking over as somebody types.
 *
 * Every rule is on screen before a key is pressed, in the neutral colour: the
 * point is to say what is wanted before anybody is refused. Once there is
 * something to judge, each line turns green with a tick when it is met and red
 * when it is not. A rule the form cannot judge -- whose name it is, on a
 * screen that does not know -- stays neutral rather than claiming a tick; the
 * server still checks it.
 *
 * The same `evaluatePassword` the server's verdict is built from, so a list
 * that is all green is a password the server will take.
 */
export function PasswordChecklist({
  password,
  subject,
  id,
}: {
  password: string;
  subject?: PasswordSubject;
  id?: string;
}) {
  const rules = evaluatePassword(password, subject);
  const typing = password.length > 0;
  const judged = rules.filter((rule) => rule.met !== null);
  const met = judged.filter((rule) => rule.met).length;

  return (
    <div className="mt-2.5">
      <ul id={id} className="space-y-1.5">
        {rules.map((rule) => {
          const state: RuleState =
            !typing || rule.met === null ? "idle" : rule.met ? "met" : "unmet";
          return (
            <li
              key={rule.id}
              className={`flex items-center gap-2 text-xs transition-colors ${LINE[state]}`}
            >
              <span
                aria-hidden="true"
                className={`flex size-4 shrink-0 items-center justify-center rounded-full ${MARK[state]}`}
              >
                {state === "met" ? (
                  <CheckIcon className="size-3" strokeWidth={3} />
                ) : state === "unmet" ? (
                  <CrossIcon className="size-3" strokeWidth={3} />
                ) : null}
              </span>
              <span>{rule.label}</span>
              {state === "idle" ? null : (
                <span className="sr-only">
                  {state === "met" ? "(done)" : "(not yet)"}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {/* Announced when the count changes rather than on every keystroke, so
          somebody listening hears progress without a running commentary. */}
      <p className="sr-only" aria-live="polite">
        {typing
          ? `${met} of ${judged.length} password requirements met.`
          : ""}
      </p>
    </div>
  );
}

/**
 * What an uncontrolled field holds, mirrored into state for a checklist to
 * read.
 *
 * The field itself stays uncontrolled, as every other field in these forms
 * is, so a server action's automatic form reset clears it exactly as it always
 * has. The mirror clears with it -- on that reset, and when the field leaves
 * the page -- so a checklist never shows ticks for a password that is no
 * longer there.
 */
export function useFieldMirror() {
  const [value, setValue] = useState("");

  const ref = useCallback((node: HTMLInputElement | null) => {
    const form = node?.form;
    if (!form) return;
    const clear = () => setValue("");
    form.addEventListener("reset", clear);
    return () => {
      form.removeEventListener("reset", clear);
      clear();
    };
  }, []);

  const onChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => setValue(event.target.value),
    [],
  );

  return { value, ref, onChange };
}

/**
 * Choosing a password: the field, its rules ticking over, and optionally the
 * same again to confirm it.
 */
export function NewPasswordField({
  name,
  label,
  confirmName,
  confirmLabel = "Password again",
  subject,
}: {
  name: string;
  label: string;
  /** Leave out for a single field. */
  confirmName?: string;
  confirmLabel?: string;
  /** Whose password this is, when the form knows. See `PasswordChecklist`. */
  subject?: PasswordSubject;
}) {
  const password = useFieldMirror();
  const confirm = useFieldMirror();
  const rulesId = useId();

  const matches = confirm.value === password.value;

  return (
    <>
      <div>
        <label htmlFor={name} className="rule-label mb-1.5 block">
          {label}
        </label>
        <PasswordInput
          ref={password.ref}
          id={name}
          name={name}
          autoComplete="new-password"
          required
          aria-describedby={rulesId}
          onChange={password.onChange}
        />
        <PasswordChecklist
          id={rulesId}
          password={password.value}
          subject={subject}
        />
      </div>

      {confirmName ? (
        <div>
          <label htmlFor={confirmName} className="rule-label mb-1.5 block">
            {confirmLabel}
          </label>
          <PasswordInput
            ref={confirm.ref}
            id={confirmName}
            name={confirmName}
            autoComplete="new-password"
            required
            onChange={confirm.onChange}
          />
          {confirm.value ? (
            <p
              aria-live="polite"
              className={`mt-2 flex items-center gap-2 text-xs ${
                matches ? "text-signal-green" : "text-signal-red"
              }`}
            >
              <span
                aria-hidden="true"
                className={`flex size-4 shrink-0 items-center justify-center rounded-full ${
                  matches ? MARK.met : MARK.unmet
                }`}
              >
                {matches ? (
                  <CheckIcon className="size-3" strokeWidth={3} />
                ) : (
                  <CrossIcon className="size-3" strokeWidth={3} />
                )}
              </span>
              {matches ? "Passwords match" : "Passwords do not match yet"}
            </p>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
