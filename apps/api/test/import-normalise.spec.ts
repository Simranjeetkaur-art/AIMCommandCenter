import { readFileSync } from "node:fs";
import { join } from "node:path";
import { normaliseQuestion, sanitiseLesson } from "../prisma/import-aim";

const CONTENT = join(__dirname, "..", "prisma", "content");
const content = JSON.parse(
  readFileSync(join(CONTENT, "aim-content.json"), "utf8"),
) as Record<string, unknown[]>;

/**
 * Every question bank in the prototype corpus, with the count each must yield.
 *
 * The first import silently dropped 35 items across three banks because the
 * normaliser guessed meaning from key names: in { q, a[], c } the choices are
 * 'a', and in { q, c[], a } they are 'c'. This pins every shape, so a bank that
 * stops importing fails the build rather than quietly shrinking the syllabus.
 */
const BANKS: Array<[string, number]> = [
  ...Array.from(
    { length: 10 },
    (_, i) => [`module${i + 1}Questions`, 10] as [string, number],
  ),
  ...Array.from(
    { length: 10 },
    (_, i) =>
      [`ACA1${String(i + 1).padStart(2, "0")}_QUESTIONS`, 10] as [
        string,
        number,
      ],
  ),
  ...Array.from(
    { length: 10 },
    (_, i) =>
      [`AEL1${String(i + 1).padStart(2, "0")}_QUESTIONS`, 10] as [
        string,
        number,
      ],
  ),
  ["authoredMissionBank", 100],
  ["certificationQuestionBank", 150],
  ["practicalQuestions", 10],
  ["checkRideStages", 5],
  ["AIM_CA_ADVANCED_MISSIONS", 100],
  ["AIM_CA_FINAL_EXAM_BANK", 50],
  ["AIM_CA_DEFENSE_CHALLENGES", 10],
  ["AEL_CRISIS_MISSIONS", 20],
  ["AEL_EXEC_QUESTIONS", 50],
  ["AEL_DEFENSE_CHALLENGES", 10],
];

describe("every prototype bank imports completely", () => {
  it.each(BANKS)("%s yields all %i items", (bank, expected) => {
    const items = content[bank] ?? [];
    expect(items).toHaveLength(expected);

    const normalised = items.map((raw, i) => normaliseQuestion(raw, bank, i));
    const dropped = normalised.filter((q) => q === null).length;

    expect(dropped).toBe(0);
    expect(normalised).toHaveLength(expected);
  });

  it("imports the whole corpus with nothing dropped", () => {
    let total = 0;
    let dropped = 0;
    for (const [bank] of BANKS) {
      for (const [i, raw] of (content[bank] ?? []).entries()) {
        total += 1;
        if (!normaliseQuestion(raw, bank, i)) dropped += 1;
      }
    }
    expect(total).toBe(BANKS.reduce((n, [, count]) => n + count, 0));
    expect(dropped).toBe(0);
  });
});

describe("normalised questions are answerable", () => {
  it.each(BANKS)("%s: every answer indexes a real choice", (bank) => {
    for (const [i, raw] of (content[bank] ?? []).entries()) {
      const q = normaliseQuestion(raw, bank, i);
      expect(q).not.toBeNull();
      expect(q!.stem.length).toBeGreaterThan(10);
      expect(q!.choices.length).toBeGreaterThan(1);
      expect(q!.correctIndex).toBeGreaterThanOrEqual(0);
      expect(q!.correctIndex).toBeLessThan(q!.choices.length);
      expect(typeof q!.choices[q!.correctIndex]).toBe("string");
    }
  });

  it("keeps both the situation and the question on a staged item", () => {
    // Check ride and crisis missions put the scene and the question in
    // separate fields; dropping either loses what is being judged.
    const stage = normaliseQuestion(
      content.checkRideStages[0],
      "checkRideStages",
      0,
    );
    expect(stage!.stem).toContain("supplier");
    expect(stage!.stem).toContain("Your command?");
  });

  it("carries the explanation through where the prototype had one", () => {
    const q = normaliseQuestion(
      content.module1Questions[0],
      "module1Questions",
      0,
    );
    expect(q!.explanation).toBeTruthy();
  });
});

describe("imported lessons are stripped of prototype wiring", () => {
  const lessons = JSON.parse(
    readFileSync(join(CONTENT, "aim-lessons.json"), "utf8"),
  ) as Record<string, string>;

  it.each(Object.keys(lessons))(
    "%s carries no inline handler or script",
    (key) => {
      const html = sanitiseLesson(lessons[key]);
      expect(html).not.toMatch(/<script/i);
      expect(html).not.toMatch(/\son[a-z]+\s*=/i);
      expect(html.length).toBeGreaterThan(300);
    },
  );
});
