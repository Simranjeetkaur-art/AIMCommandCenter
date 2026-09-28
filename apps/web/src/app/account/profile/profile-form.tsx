"use client";

import { useActionState } from "react";
import { PROFILE_LIMITS, type ProfileFields } from "@aim/contracts";
import { SubmitButton } from "@/components/submit-button";
import { FIELD } from "@/components/ui";
import { saveProfile, type ProfileState } from "../actions";

const FIELDS: Array<{
  key: keyof ProfileFields;
  label: string;
  hint?: string;
  autoComplete: string;
  type?: string;
  multiline?: boolean;
}> = [
  {
    key: "organisation",
    label: "Organisation",
    hint: "Your employer or institution.",
    autoComplete: "organization",
  },
  {
    key: "jobTitle",
    label: "Job title",
    hint: "For example: Risk Manager, Head of AI Governance.",
    autoComplete: "organization-title",
  },
  { key: "country", label: "Country", autoComplete: "country-name" },
  {
    key: "phone",
    label: "Phone number",
    hint: "Include the country code, for example +44 20 7946 0000.",
    autoComplete: "tel",
    type: "tel",
  },
  {
    key: "address",
    label: "Address",
    autoComplete: "street-address",
    multiline: true,
  },
];

export function ProfileForm({
  initial,
  required,
}: {
  initial: Partial<Record<keyof ProfileFields, string | null>>;
  /** True while this profile is what stands between the person and the courses. */
  required: boolean;
}) {
  const [state, formAction] = useActionState<ProfileState, FormData>(
    saveProfile,
    {},
  );

  return (
    <form action={formAction} className="max-w-xl space-y-4">
      {required ? <input type="hidden" name="required" value="1" /> : null}

      {FIELDS.map((field) => (
        <div key={field.key}>
          <label htmlFor={field.key} className="rule-label mb-1.5 block">
            {field.label}
          </label>
          {field.multiline ? (
            <textarea
              id={field.key}
              name={field.key}
              required
              rows={3}
              maxLength={PROFILE_LIMITS[field.key]}
              autoComplete={field.autoComplete}
              defaultValue={initial[field.key] ?? ""}
              className={`w-full ${FIELD}`}
            />
          ) : (
            <input
              id={field.key}
              name={field.key}
              type={field.type ?? "text"}
              required
              maxLength={PROFILE_LIMITS[field.key]}
              autoComplete={field.autoComplete}
              defaultValue={initial[field.key] ?? ""}
              className={`w-full ${FIELD}`}
            />
          )}
          {field.hint ? (
            <p className="mt-1 text-[11px] text-ink-400">{field.hint}</p>
          ) : null}
        </div>
      ))}

      {state.problems?.length ? (
        <ul
          role="alert"
          className="list-disc space-y-0.5 rounded-lg border border-signal-red/40 bg-signal-red/10 py-2 pl-7 pr-3 text-xs text-signal-red"
        >
          {state.problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      ) : null}
      {state.error ? (
        <p
          role="alert"
          className="rounded-lg border border-signal-red/40 bg-signal-red/10 px-3 py-2 text-xs text-signal-red"
        >
          {state.error}
        </p>
      ) : null}
      {state.done ? (
        <p
          role="status"
          className="rounded-lg border border-signal-green/40 bg-signal-green/10 px-3 py-2 text-xs text-signal-green"
        >
          {state.done}
        </p>
      ) : null}

      <SubmitButton size="lg" pendingLabel="Saving…">
        {required ? "Save and continue" : "Save profile"}
      </SubmitButton>
    </form>
  );
}
