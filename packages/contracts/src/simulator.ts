/**
 * The mission simulator.
 *
 * A simulator is not a paper. A paper is sat once: every item is shown at
 * once, answered in any order, and marked in one go at the end. A simulator is
 * *flown*: one mission at a time, in order, and the candidate is told straight
 * away whether the command decision was right and why. The feedback is the
 * training — a hundred scenarios answered into silence teaches nothing.
 *
 * That difference forces three rules, and every one of them is a rule rather
 * than a preference:
 *
 *  1. **An answer is final.** Answering reveals the key and the rationale for
 *     that mission. If the same mission could be answered twice, the second
 *     answer would be free, and the score would measure persistence rather
 *     than judgement.
 *  2. **Missions run in order.** The candidate is served the lowest-numbered
 *     mission they have not answered. Nobody skips to the end, and nobody
 *     re-opens a mission they have already been given the answer to.
 *  3. **The presented order of the options is shuffled per candidate.** See
 *     `optionOrder` below — this one exists because of a real defect in the
 *     authored corpus, not for variety.
 */

/**
 * A 32-bit string hash. Not a cryptographic one and not used as though it is:
 * its only job is to turn a seed string into a reproducible starting number.
 */
function hashSeed(seed: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** Numerical Recipes' LCG. Reproducible anywhere, which is the requirement. */
function nextRandom(state: number): number {
  return (Math.imul(1664525, state) + 1013904223) >>> 0;
}

/**
 * A bounded draw taken from the *high* bits of the state.
 *
 * `state % bound` would be the obvious way to write this and it is wrong. A
 * linear congruential generator with a power-of-two modulus has notoriously
 * short periods in its low bits -- the lowest bit of this one simply
 * alternates -- so taking the remainder makes the last swaps of a Fisher-Yates
 * shuffle nearly deterministic. Measured over 200,000 shuffles, the remainder
 * form put stored option D in seat B 67% more often than chance and in seat A
 * 67% less: a tell as usable as the one the shuffle exists to remove.
 *
 * Scaling the whole 32-bit state into the range uses the high bits instead,
 * where the period is full.
 */
function boundedDraw(state: number, bound: number): number {
  return Math.floor((state / 4294967296) * bound);
}

/**
 * The order the options are *shown* in, as indices into the stored array.
 *
 * This exists because the authored corpus has a tell. In the hundred AIM-CP
 * missions the correct option is at index 1 seventy times and index 2 thirty
 * times — it is never A and never D. In the AIM-CA hundred it is only ever B
 * or D. A candidate who noticed that and pressed B every time would score 70
 * against a pass mark of 80 without reading a single scenario, and one who
 * alternated B and D on the architecture missions would pass outright.
 *
 * Shuffling the presented order breaks the correlation between position and
 * correctness. It is deliberately a *presentational* shuffle: each option
 * keeps its own stored id, the candidate answers with that id, and marking
 * compares ids. There is no inverse permutation to apply at marking time and
 * therefore no way for the two halves to disagree.
 *
 * Deterministic in the seed so that re-rendering a mission — a refresh, a
 * back button, the feedback screen that follows the answer — shows the options
 * in the same places. A shuffle that moved under the candidate between the
 * question and the feedback would make the feedback unreadable.
 */
export function optionOrder(seed: string, count: number): number[] {
  const order = Array.from({ length: count }, (_, i) => i);
  let state = hashSeed(seed);
  for (let i = order.length - 1; i > 0; i -= 1) {
    state = nextRandom(state);
    const j = boundedDraw(state, i + 1);
    const swap = order[i];
    order[i] = order[j];
    order[j] = swap;
  }
  return order;
}

/** The seed for one mission within one run. Stable, and unique to both. */
export function missionSeed(attemptId: string, questionId: string): string {
  return `${attemptId}:${questionId}`;
}

/**
 * Reorders a mission's options for display.
 *
 * Generic over the option shape so the server can hand it whatever projection
 * it serves, and so this stays a pure list operation with no knowledge of what
 * an option contains — least of all the key, which is not in the projection.
 */
export function presentOptions<T>(options: readonly T[], seed: string): T[] {
  return optionOrder(seed, options.length).map((i) => options[i]);
}

/** The letter shown beside an option. Positional, so it follows the shuffle. */
export function optionLetter(position: number): string {
  return String.fromCharCode(65 + position);
}

/**
 * How a run stands.
 *
 * `answered` counts missions decided, not missions correct; `correct` is the
 * running score. Both are recomputed from the stored responses rather than
 * kept in a counter, so there is no second number that can drift away from the
 * answers it claims to summarise.
 */
export interface SimulatorProgress {
  total: number;
  answered: number;
  correct: number;
  /** Percentage of the whole run, not of what has been answered so far. */
  score: number;
  finished: boolean;
}

export function simulatorProgress(
  total: number,
  answered: number,
  correct: number,
): SimulatorProgress {
  return {
    total,
    answered,
    correct,
    score: total === 0 ? 0 : Math.round((correct / total) * 100),
    finished: total > 0 && answered >= total,
  };
}

/**
 * Whether the run can still reach the pass mark.
 *
 * Told to the candidate plainly once it goes false. Letting someone fly forty
 * more missions that cannot change the outcome wastes their time and teaches
 * them the instrument is decorative.
 */
export function stillReachable(
  progress: SimulatorProgress,
  passMark: number,
): boolean {
  if (progress.total === 0) return false;
  const best = progress.correct + (progress.total - progress.answered);
  return Math.round((best / progress.total) * 100) >= passMark;
}
