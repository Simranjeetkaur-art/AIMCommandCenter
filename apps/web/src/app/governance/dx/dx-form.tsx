"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import {
  AIM_DIMENSIONS,
  AIM_MAX_TOTAL,
  AIM_ROLE_BASELINES,
  AIM_SCORE_OPTIONS,
} from "@aim/contracts";
import { buttonClass } from "@/components/ui";

const TONE_FOR_SCORE = [
  "",
  "bg-signal-green/15 text-signal-green border-signal-green/40",
  "bg-signal-green/10 text-signal-green border-signal-green/30",
  "bg-signal-amber/10 text-signal-amber border-signal-amber/40",
  "bg-signal-amber/20 text-signal-amber border-signal-amber/50",
  "bg-signal-red/15 text-signal-red border-signal-red/40",
];

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={buttonClass("primary", "lg")}
    >
      {pending ? "Calculating…" : "Calculate AIM™ Dx"}
    </button>
  );
}

/**
 * The eleven dimensions.
 *
 * The running total is shown because it helps the assessor think, but the AAI
 * is deliberately not computed here. The server computes it from the posted
 * scores; this page cannot produce an index, only a set of observations.
 */
export function DxForm({
  action,
  agents,
}: {
  action: (formData: FormData) => Promise<void>;
  /**
   * Registered agents this diagnostic may be bound to. Passed only to a role
   * holding diagnostic.bind.agent; without it every run is practice.
   */
  agents?: Array<{ id: string; code: string; name: string }>;
}) {
  const [scores, setScores] = useState<number[]>(() => [
    ...AIM_ROLE_BASELINES.finance,
  ]);
  const total = scores.reduce((a, b) => a + b, 0);

  function applyBaseline(key: string) {
    const baseline = AIM_ROLE_BASELINES[key];
    if (baseline) setScores([...baseline]);
  }

  return (
    <form action={action} className="space-y-5">
      <div className="panel p-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="rule-label mb-1.5 block">Agent name</span>
            <input
              name="agentName"
              required
              minLength={2}
              defaultValue="Accounts Payable Agent"
              className="w-full rounded-lg border border-ink-700 bg-ink-950/60 px-3 py-2 text-sm outline-none focus:border-brass-500"
            />
          </label>
          <label className="block">
            <span className="rule-label mb-1.5 block">
              Accountable human owner
            </span>
            <input
              name="agentOwner"
              required
              minLength={2}
              defaultValue="CFO"
              className="w-full rounded-lg border border-ink-700 bg-ink-950/60 px-3 py-2 text-sm outline-none focus:border-brass-500"
            />
          </label>
          <label className="block">
            <span className="rule-label mb-1.5 block">Authorized purpose</span>
            <input
              name="agentPurpose"
              required
              minLength={5}
              defaultValue="Process approved vendor invoices"
              className="w-full rounded-lg border border-ink-700 bg-ink-950/60 px-3 py-2 text-sm outline-none focus:border-brass-500"
            />
          </label>
        </div>

        {agents ? (
          <div className="mt-3">
            <label htmlFor="dx-agent" className="rule-label mb-1.5 block">
              Bind to a registered agent (optional)
            </label>
            <select
              id="dx-agent"
              name="agentId"
              defaultValue=""
              className="w-full rounded-lg border border-ink-700 bg-ink-950/60 px-3 py-2 text-sm outline-none focus:border-brass-500 sm:w-auto"
            >
              <option value="">Practice run — moves no registry record</option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.code} — {agent.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-ink-400">
              Binding records this diagnostic against the agent and sets its
              recorded AAI. A practice run changes nothing in the register.
            </p>
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="rule-label">Start from a baseline</span>
          {Object.keys(AIM_ROLE_BASELINES).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => applyBaseline(key)}
              className={buttonClass("quiet", "sm")}
            >
              {key}
            </button>
          ))}
          {/* type="reset" returns the three fields to their defaults; the
              scores are React state, so they are put back by hand. */}
          <button
            type="reset"
            onClick={() => setScores([...AIM_ROLE_BASELINES.finance])}
            className={`${buttonClass("quiet", "sm")} ml-auto`}
          >
            Reset
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {AIM_DIMENSIONS.map((dim, i) => (
          <div
            key={dim.key}
            className="panel flex flex-wrap items-center gap-4 px-4 py-3"
          >
            <div className="min-w-56 flex-1">
              <p className="text-sm font-medium">
                <span className="mr-2 font-mono text-xs text-ink-400">
                  {String(i + 1).padStart(2, "0")}
                </span>
                {dim.name}
              </p>
              <p className="mt-0.5 text-xs text-ink-400">{dim.description}</p>
            </div>

            <input type="hidden" name={`score_${i}`} value={scores[i]} />
            <div className="flex gap-1.5">
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  title={AIM_SCORE_OPTIONS[value - 1]}
                  aria-pressed={scores[i] === value}
                  aria-label={`${dim.name}: ${value} — ${AIM_SCORE_OPTIONS[value - 1]}`}
                  onClick={() =>
                    setScores((prev) =>
                      prev.map((s, idx) => (idx === i ? value : s)),
                    )
                  }
                  className={`h-9 w-9 rounded-lg border text-sm font-semibold tabular-nums transition ${
                    scores[i] === value
                      ? TONE_FOR_SCORE[value]
                      : "border-ink-800 text-ink-400 hover:border-ink-400"
                  }`}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 panel px-5 py-4">
        <div>
          <p className="rule-label">Observed total</p>
          <p className="text-2xl font-semibold tabular-nums">
            {total}{" "}
            <span className="text-sm font-normal text-ink-400">
              / {AIM_MAX_TOTAL}
            </span>
          </p>
          <p className="mt-1 text-xs text-ink-400">
            The index is computed on the server from these eleven scores.
          </p>
        </div>
        <Submit />
      </div>
    </form>
  );
}
