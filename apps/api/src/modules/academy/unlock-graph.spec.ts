import { reachesOrigin, type TrackEdges } from "./unlock-graph";

/** A ladder, written as "track: the tracks it requires". */
function ladder(graph: Record<string, string[]>) {
  const calls: string[][] = [];
  const lookup = async (codes: readonly string[]): Promise<TrackEdges[]> => {
    calls.push([...codes]);
    return codes
      .filter((code) => code in graph)
      .map((code) => ({ code, requires: graph[code] }));
  };
  return { lookup, calls };
}

describe("reachesOrigin", () => {
  it("lets a straight ladder through", async () => {
    const { lookup } = ladder({
      "AIM-CP": [],
      "AIM-CA": ["AIM-CP"],
      "AIM-EL": ["AIM-CA"],
    });
    // AIM-EL requiring AIM-CA is fine: AIM-CA leads down to AIM-CP and stops.
    await expect(reachesOrigin("AIM-EL", "AIM-CA", lookup)).resolves.toBe(
      false,
    );
  });

  it("catches a track requiring itself", async () => {
    const { lookup } = ladder({ "AIM-CP": [] });
    await expect(reachesOrigin("AIM-CP", "AIM-CP", lookup)).resolves.toBe(true);
  });

  it("catches two tracks requiring each other", async () => {
    const { lookup } = ladder({ "AIM-CP": [], "AIM-CA": ["AIM-CP"] });
    // AIM-CP requiring AIM-CA closes the loop: neither could ever be entered.
    await expect(reachesOrigin("AIM-CP", "AIM-CA", lookup)).resolves.toBe(true);
  });

  it("catches a loop three tracks long", async () => {
    const { lookup } = ladder({ A: ["C"], B: ["A"], C: [] });
    await expect(reachesOrigin("C", "B", lookup)).resolves.toBe(true);
  });

  /**
   * The bug this file exists for.
   *
   * The first version of the walk followed only *active* rules, so a cycle
   * could be built in three steps that were each individually legal: switch
   * AIM-CA's rule off, add the opposite rule on AIM-CP, switch AIM-CA's back
   * on. Only the last step was refused -- by which point the data already held
   * a cycle. An inactive rule is one switch away from being active, so it is
   * an edge.
   */
  it("counts a switched-off rule as an edge", async () => {
    const { lookup } = ladder({ "AIM-CP": [], "AIM-CA": ["AIM-CP"] });
    await expect(reachesOrigin("AIM-CP", "AIM-CA", lookup)).resolves.toBe(true);
  });

  it("does not loop forever on a diamond", async () => {
    // D requires B and C; both require A. A shared ancestor is not a cycle.
    const { lookup, calls } = ladder({
      A: [],
      B: ["A"],
      C: ["A"],
      D: ["B", "C"],
    });
    await expect(reachesOrigin("E", "D", lookup)).resolves.toBe(false);
    expect(calls.length).toBeLessThanOrEqual(4);
  });

  it("asks for each level in one batch, not one track at a time", async () => {
    const { lookup, calls } = ladder({
      A: [],
      B: ["A"],
      C: ["A"],
      D: ["B", "C"],
    });
    await reachesOrigin("Z", "D", lookup);
    expect(calls[0]).toEqual(["D"]);
    expect(calls[1]).toEqual(["B", "C"]);
  });

  it("gives up rather than hanging on a ladder longer than the limit", async () => {
    const graph: Record<string, string[]> = {};
    for (let i = 0; i < 40; i += 1) graph[`T${i}`] = [`T${i + 1}`];
    graph.T40 = [];
    const { lookup, calls } = ladder(graph);
    await expect(reachesOrigin("ORIGIN", "T0", lookup)).resolves.toBe(false);
    expect(calls.length).toBeLessThanOrEqual(12);
  });
});
