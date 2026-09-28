"use client";

import { useState } from "react";

const FIELD =
  "rounded-lg border border-ink-700 bg-ink-950/60 px-3 py-2 text-xs";

export const RULE_TYPES = [
  { value: "CREDENTIAL_HELD", label: "Holds a credential", needs: "track" },
  { value: "BADGE_HELD", label: "Holds a badge", needs: "badge" },
  { value: "COHORT_MEMBER", label: "Is on a cohort", needs: "cohort" },
  {
    value: "MODULES_COMPLETED",
    label: "Has finished modules",
    needs: "modules",
  },
  { value: "DATE_WINDOW", label: "Within a date window", needs: "dates" },
  { value: "MANUAL_GRANT", label: "Admitted by the academy", needs: "none" },
] as const;

export interface RuleChoices {
  tracks: Array<{ code: string; title: string }>;
  badges: Array<{ code: string; title: string }>;
  cohorts: Array<{ id: string; title: string }>;
}

/**
 * The fields one requirement needs, and no others.
 *
 * A requirement means a different thing depending on what it is measuring, so
 * showing every field at once would ask for a badge code on a date window. The
 * type is chosen first and the form follows it.
 */
export function RuleFields({
  choices,
  initialType = "CREDENTIAL_HELD",
  initial,
}: {
  choices: RuleChoices;
  initialType?: string;
  initial?: {
    requiredProgrammeCode?: string | null;
    requiredBadgeCode?: string | null;
    requiredCohortId?: string | null;
    threshold?: number | null;
    opensAt?: string | null;
    closesAt?: string | null;
    label?: string;
  };
}) {
  const [type, setType] = useState(initialType);
  const needs = RULE_TYPES.find((t) => t.value === type)?.needs ?? "none";
  const day = (iso?: string | null) => (iso ? iso.slice(0, 10) : "");

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div>
        <label className="rule-label mb-1 block">Requirement</label>
        <select
          name="type"
          value={type}
          onChange={(event) => setType(event.target.value)}
          className={FIELD}
        >
          {RULE_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      {(needs === "track" || needs === "modules") && (
        <div>
          <label className="rule-label mb-1 block">
            {needs === "track" ? "From which track" : "Modules of"}
          </label>
          <select
            name="requiredProgrammeCode"
            defaultValue={initial?.requiredProgrammeCode ?? ""}
            className={FIELD}
          >
            {needs === "modules" && <option value="">This track</option>}
            {choices.tracks.map((t) => (
              <option key={t.code} value={t.code}>
                {t.code} — {t.title}
              </option>
            ))}
          </select>
        </div>
      )}

      {needs === "badge" && (
        <div>
          <label className="rule-label mb-1 block">Which badge</label>
          <select
            name="requiredBadgeCode"
            defaultValue={initial?.requiredBadgeCode ?? ""}
            className={FIELD}
          >
            {choices.badges.map((b) => (
              <option key={b.code} value={b.code}>
                {b.title}
              </option>
            ))}
          </select>
        </div>
      )}

      {needs === "cohort" && (
        <div>
          <label className="rule-label mb-1 block">Which cohort</label>
          <select
            name="requiredCohortId"
            defaultValue={initial?.requiredCohortId ?? ""}
            className={FIELD}
          >
            {choices.cohorts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </div>
      )}

      {needs === "modules" && (
        <div>
          <label className="rule-label mb-1 block">How many</label>
          <input
            name="threshold"
            type="number"
            min={1}
            max={99}
            defaultValue={initial?.threshold ?? 1}
            className={`${FIELD} w-20`}
          />
        </div>
      )}

      {needs === "dates" && (
        <>
          <div>
            <label className="rule-label mb-1 block">Opens</label>
            <input
              name="opensAt"
              type="date"
              defaultValue={day(initial?.opensAt)}
              className={FIELD}
            />
          </div>
          <div>
            <label className="rule-label mb-1 block">Closes</label>
            <input
              name="closesAt"
              type="date"
              defaultValue={day(initial?.closesAt)}
              className={FIELD}
            />
          </div>
        </>
      )}

      <div className="min-w-56 flex-1">
        <label className="rule-label mb-1 block">
          What the candidate is told{" "}
          <span className="text-ink-500">— optional</span>
        </label>
        <input
          name="label"
          maxLength={160}
          defaultValue={initial?.label ?? ""}
          placeholder="Left blank, the system words it"
          className={`${FIELD} w-full`}
        />
      </div>
    </div>
  );
}
