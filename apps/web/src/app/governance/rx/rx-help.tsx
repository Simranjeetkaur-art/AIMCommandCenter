import { Formula, HelpBlock, Modal } from "@/components/modal";

/** The six things a reader does with a prescription, in order. */
const STEPS: ReadonlyArray<[string, string]> = [
  [
    "Read the situation analysis",
    "Understand the agent's overall authority profile before looking at any single recommendation.",
  ],
  [
    "Review the exposure drivers",
    "See which authority dimensions are creating the greatest concern, and why.",
  ],
  ["Follow the recommended remedy", "In priority order: P1 first."],
  [
    "Hand over the modification specification",
    "It is written for the business, engineering, security and governance teams who will implement it.",
  ],
  [
    "Apply the A/G/H/X boundaries",
    "So the agent knows what it may do autonomously, what is gated, what stays human-reserved, and what is prohibited.",
  ],
  [
    "Reassess in Dx",
    "After the architecture actually changes. The new score should reflect the modified agent, not a paper adjustment to the old one.",
  ],
];

/**
 * How to read a prescription.
 *
 * The question this answers most often is not about the remedy but about the
 * number above it: people read AAI 60 as "60% dangerous". The formula is here
 * in words, with the arithmetic done, because that reading is worth
 * correcting wherever the score appears.
 */
export function RxHelp() {
  return (
    <Modal
      label="? How to use AIM™ Rx"
      title="How to use AIM™ Rx"
      hint="There are no assessment questions in Rx."
    >
      <p className="text-xs leading-relaxed text-ink-200">
        Rx asks nothing. Complete Dx, and the evaluation and prescription are
        derived from the eleven scores you submitted there.
      </p>

      <div className="mt-4 space-y-3">
        <HelpBlock title="How is the AAI calculated?">
          <Formula>AAI = 100 × Σ(scores) / 55</Formula>
          <p>
            AIM™ Dx scores the agent across <b>eleven authority dimensions</b>.
            Each receives a score from <b>1 to 5</b>. Those eleven scores are
            added together. The highest possible total is <b>55</b>, because 11
            × 5 = 55.
          </p>
          <p>
            The agent&apos;s total is then divided by 55 and multiplied by 100,
            which converts the result into an easy-to-read{" "}
            <b>0–100 comparison scale</b>.
          </p>
          <p className="rounded-md border border-ink-800 bg-ink-950/50 px-3 py-2">
            <b>Simple example.</b> If the eleven scores add up to 33:{" "}
            <b>100 × 33 ÷ 55 = 60</b>. The agent&apos;s AAI is therefore{" "}
            <b>60</b>, which falls in the <b>Elevated Exposure</b> band.
          </p>
          <p>
            <b>Important:</b> the AAI is not a safety grade, and it does not
            mean &ldquo;60% dangerous.&rdquo; It is a structured measure of how
            much autonomy and authority are concentrated in the agent. Rx then
            explains what is driving that exposure and what should change.
          </p>
        </HelpBlock>

        <HelpBlock title="What the prescription is for">
          <ol className="space-y-1.5">
            {STEPS.map(([what, detail], i) => (
              <li key={what} className="flex gap-2.5">
                <span className="font-mono text-[11px] text-brass-500">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span>
                  <b>{what}</b> — {detail}
                </span>
              </li>
            ))}
          </ol>
        </HelpBlock>

        <HelpBlock title="Rx does not lower the AAI">
          <p>
            No recommendation on this page subtracts points from the recorded
            index. A lower AAI has to come from a real reduction in authority,
            reach, velocity, consequence or human-control deficit — implemented
            first, then scored again in Dx.
          </p>
        </HelpBlock>
      </div>
    </Modal>
  );
}
