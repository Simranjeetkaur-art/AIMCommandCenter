import {
  AIM_ROLE_BASELINES,
  buildRx,
  computeAai,
  purposeContext,
  rankDimensions,
  remedySetFor,
  severityFor,
  targetScoreFor,
} from "../src";

/** A diagnostic, as the prototype's default payables agent scored it. */
function payables(scores: readonly number[]) {
  return buildRx({
    agent: {
      name: "Accounts Payable Agent",
      owner: "CFO",
      purpose: "Process approved vendor invoices",
    },
    aai: computeAai(scores),
    scores,
  });
}

describe("what the purpose makes consequential", () => {
  it("reads the domain from the agent's name and purpose together", () => {
    expect(
      purposeContext({
        name: "Accounts Payable Agent",
        owner: "CFO",
        purpose: "Process approved vendor invoices",
      }).domain,
    ).toBe("financial");

    // "Diagnostic" is AIM Dx's own word, not a clinical one.
    expect(
      purposeContext({
        name: "Quarterly diagnostic",
        owner: "Risk office",
        purpose: "Test the Dx to Rx to registry path",
      }).domain,
    ).toBe("enterprise");
    expect(
      purposeContext({
        name: "Radiology aid",
        owner: "CMO",
        purpose: "Suggest a diagnosis for review",
      }).domain,
    ).toBe("healthcare");

    expect(
      purposeContext({
        name: "Triage Assistant",
        owner: "Chief Medical Officer",
        purpose: "Summarize patient records for clinicians",
      }).domain,
    ).toBe("healthcare");

    expect(
      purposeContext({
        name: "Containment Agent",
        owner: "CISO",
        purpose: "Respond to endpoint security incidents",
      }).domain,
    ).toBe("cybersecurity");
  });

  it("falls back to an enterprise reading rather than guessing", () => {
    const context = purposeContext({
      name: "Helper",
      owner: "Ops",
      purpose: "Do useful things for the team",
    });
    expect(context.domain).toBe("enterprise");
    expect(context.noun).toBe("real-world actions");
  });
});

describe("ranking and severity", () => {
  it("orders by score, and breaks ties by dimension order rather than chance", () => {
    const ranked = rankDimensions([3, 5, 3, 1, 5, 1, 1, 1, 1, 1, 1]);
    expect(ranked.slice(0, 2).map((r) => r.index)).toEqual([1, 4]);
    // Both 3s follow the 5s, and the earlier dimension comes first.
    expect(ranked.slice(2, 4).map((r) => r.index)).toEqual([0, 2]);
  });

  it("names severity the way the prototype did", () => {
    expect(severityFor(5)).toBe("Critical");
    expect(severityFor(4)).toBe("High");
    expect(severityFor(3)).toBe("Moderate");
    expect(severityFor(2)).toBe("Lower");
    expect(severityFor(1)).toBe("Lower");
  });

  it("never proposes a target above the score it is reducing", () => {
    for (let score = 1; score <= 5; score += 1) {
      for (const aai of [10, 30, 60, 90]) {
        expect(targetScoreFor(score, aai)).toBeLessThanOrEqual(score);
        expect(targetScoreFor(score, aai)).toBeGreaterThanOrEqual(1);
      }
    }
  });
});

describe("the remedy set is scaled by band", () => {
  const critical = [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
  const elevated = [4, 4, 4, 4, 4, 3, 4, 4, 4, 3, 3];
  const lower = [1, 1, 1, 2, 1, 1, 2, 2, 2, 1, 1];

  it("gives a critical profile seven priorities and a lower one at most two", () => {
    expect(
      remedySetFor(rankDimensions(critical), computeAai(critical)),
    ).toHaveLength(7);
    expect(
      remedySetFor(rankDimensions(elevated), computeAai(elevated)).length,
    ).toBe(5);
    expect(
      remedySetFor(rankDimensions(lower), computeAai(lower)).length,
    ).toBeLessThanOrEqual(2);
  });

  it("always prescribes something, even where nothing scored materially", () => {
    const flat = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
    expect(
      remedySetFor(rankDimensions(flat), computeAai(flat)).length,
    ).toBeGreaterThan(0);
  });

  it("numbers the priorities P1 first, in order, with no gaps", () => {
    const rx = payables(elevated);
    expect(rx.controls.map((c) => c.rank)).toEqual(
      rx.controls.map((_, i) => i + 1),
    );
    expect(rx.controls[0].score).toBeGreaterThanOrEqual(
      rx.controls[rx.controls.length - 1].score,
    );
  });
});

describe("A/G/H/X is about this agent, not about the framework", () => {
  const scores = [4, 4, 4, 4, 4, 3, 4, 4, 4, 3, 3];

  it("gives a payables agent and a clinical agent different boundaries", () => {
    const finance = buildRx({
      agent: {
        name: "Accounts Payable Agent",
        owner: "CFO",
        purpose: "Process approved vendor invoices",
      },
      aai: computeAai(scores),
      scores,
    });
    const clinical = buildRx({
      agent: {
        name: "Triage Assistant",
        owner: "Chief Medical Officer",
        purpose: "Summarize patient records for clinicians",
      },
      aai: computeAai(scores),
      scores,
    });

    const items = (rx: typeof finance, key: "A" | "G" | "H" | "X") =>
      rx.actionClasses.find((c) => c.key === key)!.items.join(" ");

    expect(items(finance, "H")).toContain("vendor banking changes");
    expect(items(clinical, "H")).toContain("medication changes");
    expect(items(finance, "H")).not.toEqual(items(clinical, "H"));
  });

  it("tightens the boundaries as the scores rise", () => {
    const low = payables([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
    const high = payables([5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5]);

    const prohibited = (rx: typeof low) =>
      rx.actionClasses.find((c) => c.key === "X")!.items;

    expect(prohibited(high).length).toBeGreaterThan(prohibited(low).length);
    expect(prohibited(high).join(" ")).toContain("kill switches");
  });

  it("never repeats a boundary inside a class", () => {
    const rx = payables(scores);
    for (const klass of rx.actionClasses) {
      expect(new Set(klass.items).size).toBe(klass.items.length);
    }
  });

  it("classifies every action class, in order", () => {
    expect(payables(scores).actionClasses.map((c) => c.key)).toEqual([
      "A",
      "G",
      "H",
      "X",
    ]);
  });
});

describe("the whole evaluation", () => {
  it("is deterministic: the same diagnostic always reads the same way", () => {
    const scores = AIM_ROLE_BASELINES.finance;
    expect(JSON.stringify(payables(scores))).toBe(
      JSON.stringify(payables(scores)),
    );
  });

  it("names the three concentrations it says are driving the exposure", () => {
    const rx = payables([2, 2, 5, 2, 4, 1, 1, 1, 4, 1, 1]);
    expect(rx.drivers.map((d) => d.dimension)).toEqual([
      "Financial Authority",
      "Tool & Infrastructure Access",
      "Consequence Severity",
    ]);
    expect(rx.situation.concentrations[0]).toBe("Financial Authority (5/5)");
    // Every driver explains itself; an unexplained rank is not a diagnosis.
    for (const driver of rx.drivers) {
      expect(driver.explanation.length).toBeGreaterThan(0);
      expect(driver.effect.length).toBeGreaterThan(0);
    }
  });

  it("reads the band as a management position, not as a grade", () => {
    expect(
      payables([5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5]).situation.interpretation,
    ).toContain("critical control attention");
    expect(
      payables([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]).situation.interpretation,
    ).toContain("does not make the agent automatically safe");
  });

  it("keeps the accountable owner on the evaluation", () => {
    expect(payables(AIM_ROLE_BASELINES.finance).situation.accountable).toBe(
      "CFO",
    );
  });

  it("writes the modification specification against the authorized purpose", () => {
    const rx = payables(AIM_ROLE_BASELINES.finance);
    expect(rx.modification.target).toContain(
      "Process approved vendor invoices",
    );
    expect(rx.modification.requirements.length).toBeGreaterThan(0);
    expect(rx.modification.requirements.length).toBeLessThanOrEqual(6);
  });

  it("states the index it was derived from, and its band", () => {
    const scores = [4, 4, 4, 4, 4, 3, 4, 4, 4, 3, 3];
    const rx = payables(scores);
    expect(rx.aai).toBe(74.5);
    expect(rx.bandLabel).toBe("Elevated Exposure");
    expect(rx.summary).toContain("74.5/100");
  });
});
