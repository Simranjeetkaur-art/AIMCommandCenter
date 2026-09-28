import { readFileSync } from "node:fs";
import { join } from "node:path";
import { hasLessonContent } from "@aim/contracts";
import { parseLesson } from "../prisma/lesson-parser";
import { sanitiseLesson } from "../prisma/import-aim";

const lessons = JSON.parse(
  readFileSync(
    join(__dirname, "..", "prisma", "content", "aim-lessons.json"),
    "utf8",
  ),
) as Record<string, string>;

const keys = Object.keys(lessons);

/**
 * Every prototype lesson must survive the trip into structure.
 *
 * The point of parsing them is that an author can edit them afterwards. A
 * lesson that comes back as an empty shell is not editable content, it is a
 * silent loss, so each one is checked for the parts that make it a lesson.
 */
describe("every lesson parses into editable structure", () => {
  it("has thirty lessons to parse", () => {
    expect(keys).toHaveLength(30);
  });

  it.each(keys)("%s yields real content", (key) => {
    const parsed = parseLesson(sanitiseLesson(lessons[key]));

    expect(hasLessonContent(parsed)).toBe(true);
    expect(parsed.heading).toBeTruthy();
    expect(parsed.eyebrow).toBeTruthy();
    expect(parsed.sections.length).toBeGreaterThan(0);

    for (const section of parsed.sections) {
      expect(section.heading.length).toBeGreaterThan(2);
      expect(
        section.paragraphs.length + (section.blocks?.length ?? 0),
      ).toBeGreaterThan(0);
    }
  });

  it("carries no markup through into the structured text", () => {
    for (const key of keys) {
      const parsed = parseLesson(sanitiseLesson(lessons[key]));
      const all = JSON.stringify(parsed);
      expect(all).not.toMatch(/<\/?(div|p|h3|span|ul|li|b)\b/i);
      expect(all).not.toMatch(/&nbsp;|&amp;|&lt;/);
    }
  });
});

describe("the AEL-101 lesson, which the prototype screen shows", () => {
  const parsed = parseLesson(sanitiseLesson(lessons.openAimEl101));

  it("keeps the eyebrow and title", () => {
    expect(parsed.eyebrow).toBe("AIM-EL™ · AEL-101");
    expect(parsed.heading).toBe("Executive AI Authority & Accountability");
  });

  it("keeps the learning path", () => {
    expect(parsed.path).toEqual([
      "LEARN",
      "EXECUTIVE CASE",
      "KEY INSIGHT",
      "LEADERSHIP DECISION",
      "ASSESSMENT",
    ]);
  });

  it("keeps the course overview", () => {
    expect(parsed.overview).toContain(
      "Enterprise leaders do not need to reproduce",
    );
  });

  it("keeps all five learning objectives", () => {
    expect(parsed.objectives).toHaveLength(5);
    expect(parsed.objectives?.[0]).toBe(
      "Separate AI capability from enterprise authority.",
    );
  });

  it("keeps the numbered sections in order", () => {
    expect(parsed.sections[0].number).toBe("1");
    expect(parsed.sections[0].heading).toBe("Capability Is Not Authority");
    expect(parsed.sections[1].heading).toBe(
      "Executive Accountability Does Not Automate Away",
    );
  });

  it("keeps the key insight attached to its section", () => {
    const insight = parsed.sections[0].blocks?.find(
      (b) => b.kind === "KEY_INSIGHT",
    );
    expect(insight).toBeDefined();
    expect(insight?.body).toContain("determines what it is allowed to cause");
  });
});

describe("the AIM-CP module 1 lesson, which uses the other shape", () => {
  const parsed = parseLesson(sanitiseLesson(lessons.module1Lesson));

  it("keeps the lead and the stat chips", () => {
    expect(parsed.lead).toContain("first responsibility of an AI commander");
    expect(parsed.stats?.length).toBeGreaterThan(1);
  });

  it("keeps the learning objectives from the other markup", () => {
    expect(parsed.objectives?.length).toBeGreaterThan(3);
  });

  it("keeps its numbered sections", () => {
    expect(parsed.sections.length).toBeGreaterThan(2);
    expect(parsed.sections[0].heading).toBe("Intelligence Is Not Authority");
  });
});
