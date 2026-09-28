import { drawQuestions, drawSize, poolForKind, servedIds } from "../src/draw";

const ids = Array.from({ length: 100 }, (_, i) => `q${i}`);
let seed = 7;
const rng = (max: number) => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed % max;
};

describe("drawing a paper", () => {
  it("draws the requested number of distinct questions from the pool", () => {
    const drawn = drawQuestions(ids, 20, rng);
    expect(drawn).toHaveLength(20);
    expect(new Set(drawn).size).toBe(20);
    drawn.forEach((id) => expect(ids).toContain(id));
  });

  it("never draws more than the pool holds, and null means the whole pool", () => {
    expect(drawQuestions(ids.slice(0, 5), 10, rng)).toHaveLength(5);
    expect(drawQuestions(ids, null, rng)).toHaveLength(100);
    expect(drawSize(8, null)).toBe(8);
  });

  it("does not serve the same selection every time", () => {
    const a = drawQuestions(ids, 10, rng).join();
    const b = drawQuestions(ids, 10, rng).join();
    expect(a).not.toBe(b);
  });

  it("keeps simulator missions and quiz questions in separate pools", () => {
    expect(poolForKind("SIMULATION")).toBe("SIMULATOR");
    expect(poolForKind("QUIZ")).toBe("QUIZ");
  });

  it("serves an old attempt the whole paper and drops removed questions", () => {
    expect(servedIds(null, ["a", "b"])).toEqual(["a", "b"]);
    expect(servedIds(["b", "gone", "a"], ["a", "b"])).toEqual(["b", "a"]);
  });
});

describe("seededShuffle", () => {
  const { seededShuffle } = require("../src") as typeof import("../src");
  const items = ["a", "b", "c", "d"];

  it("is stable for one seed and keeps every item", () => {
    const once = seededShuffle(items, "attempt-1:q1");
    expect(seededShuffle(items, "attempt-1:q1")).toEqual(once);
    expect([...once].sort()).toEqual(items);
    expect(items).toEqual(["a", "b", "c", "d"]);
  });

  it("gives different orders across seeds", () => {
    const orders = new Set(
      Array.from({ length: 20 }, (_, i) =>
        seededShuffle(items, `attempt-${i}:q1`).join(""),
      ),
    );
    expect(orders.size).toBeGreaterThan(5);
  });
});
