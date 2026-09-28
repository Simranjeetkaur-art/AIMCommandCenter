import {
  conversationPair,
  mayStartConversation,
  needsAssignment,
} from "../src/messaging";

describe("who may start a conversation", () => {
  it("lets an administrator reach every role", () => {
    for (const to of ["ADMIN", "MANAGER", "INSTRUCTOR", "STUDENT"] as const) {
      expect(mayStartConversation("ADMIN", to).ok).toBe(true);
    }
  });

  it("limits a candidate to their examiner", () => {
    expect(mayStartConversation("STUDENT", "INSTRUCTOR")).toMatchObject({
      ok: true,
      requiresAssignment: true,
    });
    for (const to of ["ADMIN", "MANAGER", "STUDENT"] as const) {
      const verdict = mayStartConversation("STUDENT", to);
      expect(verdict.ok).toBe(false);
      expect(verdict.reason).toMatch(/examiner/);
    }
  });

  it("keeps managers out of candidates' inboxes", () => {
    expect(mayStartConversation("MANAGER", "STUDENT").ok).toBe(false);
    expect(mayStartConversation("MANAGER", "INSTRUCTOR").ok).toBe(true);
    expect(mayStartConversation("MANAGER", "ADMIN").ok).toBe(true);
  });

  it("lets an examiner reach staff freely and learners only when assigned", () => {
    expect(mayStartConversation("INSTRUCTOR", "ADMIN")).toMatchObject({
      ok: true,
      requiresAssignment: false,
    });
    expect(mayStartConversation("INSTRUCTOR", "STUDENT")).toMatchObject({
      ok: true,
      requiresAssignment: true,
    });
  });

  it("only demands an assignment across the teaching line", () => {
    expect(needsAssignment("INSTRUCTOR", "STUDENT")).toBe(true);
    expect(needsAssignment("STUDENT", "INSTRUCTOR")).toBe(true);
    expect(needsAssignment("ADMIN", "STUDENT")).toBe(false);
    expect(needsAssignment("INSTRUCTOR", "MANAGER")).toBe(false);
  });

  it("stores a pair in one order however it is opened", () => {
    expect(conversationPair("b", "a")).toEqual(conversationPair("a", "b"));
    expect(conversationPair("a", "b").lowUserId).toBe("a");
  });
});
