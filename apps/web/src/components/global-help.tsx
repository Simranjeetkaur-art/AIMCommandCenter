"use client";

import { useState } from "react";
import { Formula, HelpBlock, Modal } from "./modal";
import { buttonClass } from "./ui";

/**
 * The formula guide, reachable from every page.
 *
 * AAI, the envelope and A/G/H/X are the terms the whole product is written
 * in. Explaining them only on the screen that uses them leaves everybody who
 * arrives at a certificate, a registry row or a review with a number and no
 * way to find out what it means.
 */

const TABS = [
  ["quick", "Quick guide"],
  ["formula", "Formulas"],
  ["rx", "Rx / P1–P9"],
  ["aghx", "A/G/H/X"],
  ["terms", "Terms"],
] as const;

type Tab = (typeof TABS)[number][0];

function QuickGuide() {
  return (
    <div className="space-y-3">
      <p className="text-xs leading-relaxed text-ink-200">
        AIM™ separates intelligence from authority. The model may reason
        broadly, while the organization deliberately limits what it may cause.
      </p>
      <HelpBlock title="AIM™ Dx — diagnose">
        <p>
          Record the agent&apos;s actual authority across eleven dimensions. Dx
          produces the AAI and identifies where authority is concentrated. The
          AAI is a comparison index, not deployment permission.
        </p>
      </HelpBlock>
      <HelpBlock title="AIM™ Rx — prescribe">
        <p>
          Explain what the Dx profile means for management, identify the
          strongest exposure drivers, and prescribe concrete changes to
          authority, gates, privileges, velocity, scale, reversibility and human
          control.
        </p>
      </HelpBlock>
      <HelpBlock title="AIM™ Academy — qualify">
        <p>
          Learn the framework, demonstrate competency, and practise command
          decisions under changing scenarios.
        </p>
      </HelpBlock>
      <HelpBlock title="Certification — certify">
        <p>
          Demonstrate knowledge and practical command competency through earned
          module badges, simulator work, the exam, a practical Dx/Rx and the
          Commander Check Ride.
        </p>
      </HelpBlock>
    </div>
  );
}

function Formulas() {
  return (
    <div className="space-y-3">
      <p className="text-xs leading-relaxed text-ink-400">
        These formulas are management models. Their purpose is to make
        governance relationships explicit and discussable; they are not claims
        that every organizational risk reduces to a universal physical law.
      </p>

      <HelpBlock title="1. AIM™ Autonomy Index">
        <Formula>AAI = 100 × Σ(scores) / 55</Formula>
        <p>
          <b>Σ(scores)</b> means add the eleven 1–5 dimension scores. The
          maximum is <b>11 × 5 = 55</b>. Dividing by 55 expresses the raw total
          as a fraction of the maximum; multiplying by 100 places it on a 0–100
          comparison scale.
        </p>
        <p className="rounded-md border border-ink-800 bg-ink-950/50 px-3 py-2">
          <b>Example:</b> total 33 → 33 ÷ 55 = 0.60 → 0.60 × 100 = <b>AAI 60</b>
          .
        </p>
        <p>
          <b>
            Do not read AAI 60 as &ldquo;60% dangerous,&rdquo; &ldquo;60% likely
            to fail,&rdquo; or &ldquo;60% safe.&rdquo;
          </b>{" "}
          It means the scored authority profile converts to 60 on AIM™&apos;s
          standardized comparison scale.
        </p>
      </HelpBlock>

      <HelpBlock title="2. Weighted AAI">
        <Formula>AAIᵥ = 100 × Σ(wᵢSᵢ) / (5Σwᵢ)</Formula>
        <p>
          <b>Sᵢ</b> is a dimension score and <b>wᵢ</b> its assigned weight.
          Weighting lets an organization give greater importance to the
          dimensions that matter more in its validated context. Weights should
          be governed and justified, not changed to obtain a preferred score.
        </p>
      </HelpBlock>

      <HelpBlock title="3. Authority Envelope">
        <Formula>E = P ∩ D ∩ X ∩ F ∩ T ∩ L ∩ S ∩ Q</Formula>
        <p>
          <b>∩</b> means intersection — effectively <b>AND</b>. The action must
          satisfy every applicable boundary: Purpose, Data, Action, Financial,
          Time, Delegation, Systems, Consequence.
        </p>
        <p>
          If a $72,000 payment satisfies purpose, data, time and system
          boundaries but the autonomous financial ceiling is $25,000, the action
          is outside the envelope.
        </p>
      </HelpBlock>

      <HelpBlock title="4. Permitted Action">
        <Formula>
          Permitted Action = Constitution ∩ Authorization ∩ Authority Envelope
        </Formula>
        <p>
          An action should proceed only when organizational rules, specific
          authorization and the agent&apos;s operating envelope all permit it.
          One layer should not silently override the others.
        </p>
      </HelpBlock>

      <HelpBlock title="5. Sovereign Control / Last Command">
        <Formula>
          Sovereign Control = External Revocation + Cessation Verification +
          Safe Reversion
        </Formula>
        <p>
          <b>External revocation:</b> an authorized human can remove
          consequential authority through a mechanism the agent does not
          control. <b>Cessation verification:</b> evidence confirms the
          authority actually stopped. <b>Safe reversion:</b> operations can
          return to a known safe state.
        </p>
      </HelpBlock>

      <HelpBlock title="6. Decision Under Risk">
        <Formula>
          a* = argmax[V(a) − λR(a)] subject to governance constraints
        </Formula>
        <p>
          Choose the permitted action that creates the greatest expected value
          after accounting for risk — <b>but only among actions allowed</b> by
          the organization&apos;s constitutional, authorization and sovereignty
          constraints. Optimization never creates authority.
        </p>
      </HelpBlock>

      <HelpBlock title="7. Authority Drift">
        <Formula>ΔG = A_effective − A_approved</Formula>
        <p>
          Compare what the agent can effectively do now with what was approved.
          A positive gap means authority has expanded through permissions,
          tools, integrations, delegation, configuration or operating context,
          and requires review.
        </p>
      </HelpBlock>
    </div>
  );
}

function RxGuide() {
  return (
    <div className="space-y-3">
      <p className="text-xs leading-relaxed text-ink-200">
        Rx is not a second questionnaire. It interprets the completed Dx and
        answers one question:{" "}
        <b>
          why does this agent have this exposure, and what should we change?
        </b>
      </p>
      <HelpBlock title="Management interpretation">
        <p>
          This narrative is derived, not fixed. It changes with the AAI, the
          band, the highest authority concentrations and the particular
          combination of capabilities. It should tell management what the
          profile means operationally rather than repeat the score.
        </p>
      </HelpBlock>
      <HelpBlock title="P1–P9 — remediation priorities">
        <p>
          <b>P means priority, not dimension.</b> P1 is the highest-priority
          remedy for this agent, P2 the next, and so on. The priorities are
          ranked from the Dx profile, and an agent may show fewer than nine when
          fewer dimensions need material remediation.
        </p>
        <p>
          Examples include reducing financial ceilings, restricting tool
          privileges, limiting delegation, throttling execution velocity,
          reducing operational scale, improving reversibility, or strengthening
          external human control.
        </p>
      </HelpBlock>
      <HelpBlock title="Modification specification">
        <p>
          Translates the diagnosis into engineering and operational language:
          current authority profile, target authority profile, implementation
          requirements. It exists so product, engineering, security, compliance
          and business owners can act on the diagnosis.
        </p>
      </HelpBlock>
      <HelpBlock title="Verify the fix">
        <p>
          Rx does not lower the existing AAI because a recommendation was
          displayed or a control was planned. Implement the real authority
          change, then run Dx again. The new score should describe the new
          actual authority profile.
        </p>
      </HelpBlock>
    </div>
  );
}

function AghxGuide() {
  const classes = [
    [
      "A — Autonomous",
      "The agent may execute independently inside explicit approved boundaries. Good candidates are routine, reversible, observable actions with bounded consequence.",
      "Example: validate an invoice against an approved purchase order without releasing payment.",
    ],
    [
      "G — Gated",
      "The agent may prepare or initiate the action, but execution requires a threshold, approval, dual control, technical gate or other explicit condition.",
      "Example: a payment above the autonomous financial ceiling requires CFO authorization.",
    ],
    [
      "H — Human Reserved",
      "The decision or action remains human because of consequence, irreversibility, exception authority, legal accountability or sovereignty.",
      "Example: approving an exception that expands the agent's authority.",
    ],
    [
      "X — Prohibited",
      "The agent may not perform the action. Prohibitions commonly include self-expansion, disabling monitoring or revocation, unauthorized banking changes, bypassing safety controls, or operating outside authorized purpose.",
      "",
    ],
  ] as const;

  return (
    <div className="space-y-3">
      <p className="text-xs leading-relaxed text-ink-200">
        A/G/H/X classifies how actions should be governed. Rx recommendations
        are derived from the diagnosis and should ultimately be translated into
        enforceable controls.
      </p>
      {classes.map(([title, body, example]) => (
        <HelpBlock key={title} title={title}>
          <p>{body}</p>
          {example ? <p className="text-ink-400">{example}</p> : null}
        </HelpBlock>
      ))}
      <HelpBlock title="How A/G/H/X relates to the Authority Envelope">
        <p>
          The envelope defines <b>where authority exists</b>. A/G/H/X defines{" "}
          <b>how specific actions are governed</b>. An action can sit inside the
          general mission and still be Gated or Human Reserved because of
          amount, consequence, exception status or irreversibility.
        </p>
      </HelpBlock>
    </div>
  );
}

const GLOSSARY: ReadonlyArray<[string, string]> = [
  [
    "AAI — AIM™ Autonomy Index",
    "Standardized 0–100 comparison of the eleven scored authority dimensions.",
  ],
  [
    "Authority",
    "The real-world consequences the agent is permitted and technically able to cause.",
  ],
  [
    "Autonomy",
    "The degree to which the agent operates independently inside delegated authority.",
  ],
  [
    "Authority concentration",
    "Multiple consequential powers accumulated in the same agent, identity, workflow or control point.",
  ],
  [
    "Authority envelope",
    "The intersection of Purpose, Data, Action, Financial, Time, Delegation, Systems and Consequence boundaries.",
  ],
  [
    "Authority drift",
    "Change between approved authority and effective runtime authority.",
  ],
  [
    "Evidence",
    "Records sufficient to reconstruct what the agent knew, what it used, what it decided, what it did and what happened.",
  ],
  [
    "Tripwire",
    "A predefined condition that automatically pauses, reduces or revokes authority.",
  ],
  [
    "Red line",
    "An action or consequence the agent is never permitted to cross autonomously.",
  ],
  [
    "Non-delegation",
    "An agent cannot delegate authority it does not possess, or expand its own authority through sub-agents.",
  ],
  [
    "Last Command",
    "Externally retained human capability to revoke authority, verify cessation and safely revert.",
  ],
  [
    "Human-control deficit",
    "The degree to which meaningful human intervention is delayed, weak, dependent on the agent, or difficult to verify.",
  ],
];

function Glossary() {
  return (
    <dl className="space-y-2">
      {GLOSSARY.map(([term, meaning]) => (
        <div
          key={term}
          className="rounded-lg border border-ink-800 px-3 py-2 text-xs"
        >
          <dt className="font-semibold text-brass-500">{term}</dt>
          <dd className="mt-0.5 leading-relaxed text-ink-200">{meaning}</dd>
        </div>
      ))}
    </dl>
  );
}

export function GlobalHelp() {
  const [tab, setTab] = useState<Tab>("quick");

  return (
    <div className="fixed bottom-5 right-5 z-40 print:hidden">
      <Modal
        label={<span>? Help</span>}
        variant="secondary"
        size="md"
        title="Help &amp; formula guide"
        hint="Plain-English explanations, available from anywhere in the portal."
      >
        <div className="mb-4 flex flex-wrap gap-1.5">
          {TABS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={tab === key}
              onClick={() => setTab(key)}
              className={buttonClass("toggle", "sm")}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "quick" ? <QuickGuide /> : null}
        {tab === "formula" ? <Formulas /> : null}
        {tab === "rx" ? <RxGuide /> : null}
        {tab === "aghx" ? <AghxGuide /> : null}
        {tab === "terms" ? <Glossary /> : null}
      </Modal>
    </div>
  );
}
