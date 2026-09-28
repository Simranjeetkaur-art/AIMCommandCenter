/**
 * Drawing a paper.
 *
 * A paper's questions are its pool. Each attempt draws `drawCount` of them at
 * random, in a random order, and the attempt records which ones it drew, so
 * the paper a candidate is marked on is exactly the paper they were served --
 * even if an author edits the pool while the attempt is open.
 *
 * Kept free of any source of randomness: the caller passes one in, so the
 * server can use a cryptographic source and a test can use a fixed one.
 */

export type QuestionPool = "QUIZ" | "SIMULATOR";

/** Which half of a bank a paper of this kind may draw from. */
export function poolForKind(kind: string): QuestionPool {
  return kind === "SIMULATION" ? "SIMULATOR" : "QUIZ";
}

export const POOL_LABEL: Record<QuestionPool, string> = {
  QUIZ: "Quiz & exam",
  SIMULATOR: "Simulator",
};

/** Draw sizes new papers start with. An author can change any of them. */
export const DEFAULT_DRAW = {
  moduleQuiz: 10,
  simulator: 20,
  finalExam: 50,
} as const;

/** How many questions an attempt will actually get from a pool this size. */
export function drawSize(poolSize: number, drawCount: number | null): number {
  if (drawCount === null || drawCount <= 0) return poolSize;
  return Math.min(poolSize, drawCount);
}

/**
 * `count` distinct ids from `ids`, in random order (Fisher–Yates on a copy).
 * `random` returns an integer in [0, max).
 */
export function drawQuestions(
  ids: readonly string[],
  drawCount: number | null,
  random: (max: number) => number,
): string[] {
  const deck = [...ids];
  const take = drawSize(deck.length, drawCount);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = random(i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck.slice(0, take);
}

/**
 * The attempt's questions in served order. An attempt from before papers were
 * drawn has no record and was served the whole paper, so it gets the whole
 * paper back.
 */
export function servedIds(
  recorded: unknown,
  paperIds: readonly string[],
): string[] {
  if (!Array.isArray(recorded)) return [...paperIds];
  const onPaper = new Set(paperIds);
  // A question removed from the paper after the draw is dropped rather than
  // left as a hole the candidate can never answer.
  return (recorded as unknown[]).filter(
    (id): id is string => typeof id === "string" && onPaper.has(id),
  );
}

/**
 * `items` in an order fixed by `seed`: the same seed always gives the same
 * order, a different seed a different one.
 *
 * Used for answer options, seeded by attempt and question. Each attempt sees
 * the options in a new order (so one attempt's layout is no crib for the
 * next), while a reload of the same attempt, and the review of it afterwards,
 * show exactly what was served. Marking is by option id, so order never
 * affects the score.
 */
export function seededShuffle<T>(items: readonly T[], seed: string): T[] {
  // FNV-1a to a 32-bit state, then mulberry32. Not cryptographic, and it does
  // not need to be: the order is a presentation detail, not a secret.
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  let state = h >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const deck = [...items];
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}
