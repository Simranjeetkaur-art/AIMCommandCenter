import { assertLessonContent } from "../src/modules/academy/academy.service";

const section = (over: Record<string, unknown> = {}) => ({
  number: "1",
  heading: "Intelligence Is Not Authority",
  paragraphs: ["A paragraph."],
  ...over,
});

const content = (sections: unknown[]) => ({ sections });

describe("assertLessonContent", () => {
  it("accepts a plain section", () => {
    expect(() => assertLessonContent(content([section()]))).not.toThrow();
  });

  it("accepts an empty lesson", () => {
    expect(() => assertLessonContent(content([]))).not.toThrow();
  });

  it("refuses a lesson with no sections array", () => {
    expect(() => assertLessonContent({})).toThrow(/sections array/);
  });

  it("refuses a section with no heading", () => {
    expect(() =>
      assertLessonContent(content([section({ heading: "" })])),
    ).toThrow(/at least 2 characters/);
  });

  it("says the minimum, rather than claiming a heading is missing", () => {
    // A one-character heading answered "needs a heading", which reads as a
    // system fault to an author looking straight at the heading they typed.
    expect(() =>
      assertLessonContent(content([section({ heading: "T" })])),
    ).toThrow(/at least 2 characters/);
  });

  describe("callouts carry their content in whichever field their kind uses", () => {
    /**
     * The bug this block exists for.
     *
     * Emptiness was decided on `body` and `items` alone. A key-terms callout
     * keeps its content in `terms` and a link keeps its in `url`/`label`, so
     * all three of the kinds added for the lesson screen were offered by the
     * editor and then refused on save as "empty".
     */
    it("accepts a key-terms callout", () => {
      const block = {
        kind: "TERMS",
        title: "KEY TERMS",
        terms: [
          { term: "Capability", definition: "The ability to perform a task." },
        ],
      };
      expect(() =>
        assertLessonContent(content([section({ blocks: [block] })])),
      ).not.toThrow();
    });

    it("accepts a link callout with only a url", () => {
      const block = { kind: "LINK", url: "https://example.org/standard" };
      expect(() =>
        assertLessonContent(content([section({ blocks: [block] })])),
      ).not.toThrow();
    });

    it("accepts a reference callout with only a label", () => {
      const block = { kind: "REFERENCE", label: "The Last Command" };
      expect(() =>
        assertLessonContent(content([section({ blocks: [block] })])),
      ).not.toThrow();
    });

    it("still accepts the older body and items kinds", () => {
      const blocks = [
        { kind: "KEY_INSIGHT", body: "Authority is granted, not earned." },
        { kind: "LIST", items: ["One", "Two"] },
      ];
      expect(() =>
        assertLessonContent(content([section({ blocks })])),
      ).not.toThrow();
    });

    it("still refuses a callout with nothing in it at all", () => {
      expect(() =>
        assertLessonContent(
          content([section({ blocks: [{ kind: "KEY_INSIGHT", title: "X" }] })]),
        ),
      ).toThrow(/is empty/);
    });

    it("names every field it would accept", () => {
      expect(() =>
        assertLessonContent(content([section({ blocks: [{ kind: "NOTE" }] })])),
      ).toThrow(/text, list items, terms or a link/);
    });
  });

  describe("a term is a name and a meaning", () => {
    it("refuses a term with no name", () => {
      const block = {
        kind: "TERMS",
        terms: [{ term: "", definition: "Something." }],
      };
      expect(() =>
        assertLessonContent(content([section({ blocks: [block] })])),
      ).toThrow(/term 1 has no name/);
    });

    it("refuses a term with no definition, and says which", () => {
      const block = {
        kind: "TERMS",
        terms: [{ term: "Authority", definition: "  " }],
      };
      expect(() =>
        assertLessonContent(content([section({ blocks: [block] })])),
      ).toThrow(/"Authority" has no definition/);
    });

    it("refuses terms that are not a list", () => {
      const block = { kind: "TERMS", terms: "Capability — a thing" };
      expect(() =>
        assertLessonContent(content([section({ blocks: [block] })])),
      ).toThrow(/terms must be a list/);
    });
  });

  it("points at the section and callout that is wrong", () => {
    const sections = [
      section(),
      section({ heading: "Second", blocks: [{ kind: "NOTE" }] }),
    ];
    expect(() => assertLessonContent(content(sections))).toThrow(
      /Section 2, callout 1/,
    );
  });

  it("refuses paragraphs that are not a list", () => {
    expect(() =>
      assertLessonContent(content([section({ paragraphs: "text" })])),
    ).toThrow(/paragraphs must be a list/);
  });

  it("refuses blocks that are not a list", () => {
    expect(() =>
      assertLessonContent(content([section({ blocks: {} })])),
    ).toThrow(/blocks must be a list/);
  });
});
