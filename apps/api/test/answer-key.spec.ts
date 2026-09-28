import { normaliseAnswerKey } from "../src/modules/academy/academy.service";

/**
 * Marking compares the chosen option id with `answerKey.correct` exactly, so a
 * key stored as a choice index against lettered options could never match.
 * normaliseAnswerKey is what stops that shape reaching the database.
 */
describe("normaliseAnswerKey", () => {
  const lettered = [
    { id: "a", text: "one" },
    { id: "b", text: "two" },
  ];
  const numbered = [
    { id: "0", text: "one" },
    { id: "1", text: "two" },
  ];

  it("turns an index into the id of the option it points at", () => {
    expect(normaliseAnswerKey({ correct: 1 }, lettered)).toEqual({
      correct: "b",
    });
    expect(normaliseAnswerKey({ correct: 1 }, numbered)).toEqual({
      correct: "1",
    });
  });

  it("leaves a key that already names an option id alone", () => {
    expect(normaliseAnswerKey({ correct: "b" }, lettered)).toEqual({
      correct: "b",
    });
  });

  it("translates each index in a multiple-answer key", () => {
    expect(normaliseAnswerKey({ correct: [0, "b"] }, lettered)).toEqual({
      correct: ["a", "b"],
    });
  });

  it("uses the position when options are bare strings", () => {
    expect(normaliseAnswerKey({ correct: 1 }, ["one", "two"])).toEqual({
      correct: "1",
    });
  });

  it("keeps other key fields and tolerates a key with no answer", () => {
    expect(normaliseAnswerKey({ correct: 0, note: "x" }, lettered)).toEqual({
      correct: "a",
      note: "x",
    });
    expect(normaliseAnswerKey({}, lettered)).toEqual({});
  });
});
