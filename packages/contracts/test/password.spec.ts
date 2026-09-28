import {
  LOCKOUT_MINUTES,
  MAX_FAILED_LOGINS,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  PASSWORD_RESET_COOLDOWN_SECONDS,
  PASSWORD_RESET_TTL_MINUTES,
  PASSWORD_RULES,
  SESSION_END_REASONS,
  checkPassword,
  evaluatePassword,
  type PasswordSubject,
} from "../src";

/** Sound under every rule, and free of any name or address used below. */
const SOUND = "thundering-pilot-rig-7";

const ok = (password: string, subject = {}) => {
  const verdict = checkPassword(password, subject);
  expect(verdict.problems).toEqual([]);
  expect(verdict.ok).toBe(true);
};

const refused = (password: string, subject = {}) => {
  const verdict = checkPassword(password, subject);
  expect(verdict.ok).toBe(false);
  expect(verdict.problems.length).toBeGreaterThan(0);
};

describe("what counts as a password", () => {
  it("requires a number", () => {
    refused("correct-horse-battery");
  });

  it("requires a special character, and does not count a space as one", () => {
    refused("correct horse battery 7");
    ok("correct horse battery 7!");
  });

  it("counts a symbol from any script as special", () => {
    ok("kite£42x");
  });

  it("refuses anything under the minimum", () => {
    refused("Sh0rt!x");
    refused("a".repeat(MIN_PASSWORD_LENGTH - 1));
  });

  it("accepts exactly the minimum, when it is otherwise sound", () => {
    const password = "kite-42x";
    expect(password.length).toBe(MIN_PASSWORD_LENGTH);
    ok(password);
  });

  it("refuses something absurdly long, because argon2 hashes whatever it gets", () => {
    refused(
      "a-long-and-varied-phrase-".repeat(40).slice(0, MAX_PASSWORD_LENGTH + 1),
    );
  });

  it("refuses a long string of too few distinct characters", () => {
    refused("aaaaaaaaaaaaaaaa");
    refused("abababababababab");
    // Clears the length, number and symbol rules, and is still not a password.
    refused("aaaaaaa1!");
  });

  it("refuses whitespace pretending to be length", () => {
    refused(" ".repeat(MIN_PASSWORD_LENGTH + 4));
  });
});

describe("the passwords everybody tries", () => {
  it("refuses a notorious root however it is cased", () => {
    refused("myPASSWORDisgood");
    refused("Qwerty-and-more-words");
    refused("just-letmein-please");
  });

  it("refuses one dressed up to satisfy a composition rule", () => {
    // The exact string the familiar upper/digit/symbol rule waves through.
    refused("Password2026!");
  });

  it("refuses the product's own name", () => {
    refused("aimacademy-rules-ok");
    refused("AimCommand-Center-99");
  });
});

describe("a password built out of the person", () => {
  it("refuses the local part of their own address", () => {
    refused("rowan-adeyemi-2026", { email: "rowan@aim.edu" });
  });

  it("refuses their own name, in any of its words", () => {
    refused("meisandovalcommand", { name: "Mei Sandoval" });
    refused("the-sandoval-method", { name: "Mei Sandoval" });
  });

  /** A two-letter local part or name word would refuse almost everything. */
  it("ignores a very short local part", () => {
    ok(SOUND, { email: "ab@aim.edu" });
  });

  it("ignores short words inside a name", () => {
    ok(SOUND, { name: "Jo de Vries" });
  });

  it("copes with a subject that states nothing", () => {
    ok(SOUND);
    ok(SOUND, { email: null, name: null });
  });
});

describe("the rules, one at a time", () => {
  const met = (password: string, subject?: PasswordSubject) =>
    Object.fromEntries(
      evaluatePassword(password, subject).map((rule) => [rule.id, rule.met]),
    );

  it("names every rule, in the order a form shows them", () => {
    expect(evaluatePassword("").map((rule) => rule.id)).toEqual([
      "length",
      "number",
      "symbol",
      "variety",
      "common",
      "personal",
    ]);
  });

  it("ticks off each rule as it is met", () => {
    expect(met("abc")).toMatchObject({
      length: false,
      number: false,
      symbol: false,
      variety: false,
    });
    expect(met("abcdefg1")).toMatchObject({
      length: true,
      number: true,
      symbol: false,
      variety: true,
    });
    expect(met("abcdef1!")).toMatchObject({ symbol: true });
  });

  /** A form that does not know whose password it is must not claim this one. */
  it("leaves the personal rule open when there is nobody to check against", () => {
    expect(met(SOUND).personal).toBeNull();
    expect(met(SOUND, { email: "ab@aim.edu" }).personal).toBe(true);
    expect(met("rowan-99!x", { email: "rowan@aim.edu" }).personal).toBe(false);
  });

  /**
   * The checklist a form ticks off and the verdict the server gives are two
   * readings of one set of rules. A password with every box ticked that the
   * server then refuses would make the checklist a lie.
   */
  it("agrees with checkPassword on every sample", () => {
    const subject = { email: "rowan@aim.edu", name: "Rowan Adeyemi" };
    const samples = [
      "",
      "abc",
      "kite-42x",
      "Sh0rt!x",
      "aaaaaaa1!",
      "        ",
      "Password2026!",
      "rowan-99!x",
      "adeyemi-2026!",
      "correct horse battery 7!",
      SOUND,
    ];
    for (const password of samples) {
      const allMet = evaluatePassword(password, subject).every(
        (rule) => rule.met === true,
      );
      expect([password, allMet]).toEqual([
        password,
        checkPassword(password, subject).ok,
      ]);
    }
  });
});

describe("how it reports", () => {
  /**
   * Every problem at once. A form that reveals one rule at a time turns
   * choosing a password into a guessing game, which is how people end up
   * choosing a worse one.
   */
  it("returns every reason rather than the first", () => {
    const verdict = checkPassword("password", { email: "password@aim.edu" });
    expect(verdict.ok).toBe(false);
    // No number, no symbol, a notorious root, and the address itself.
    expect(verdict.problems.length).toBeGreaterThanOrEqual(4);
  });

  it("publishes the rules as prose, so a form can state them before somebody types", () => {
    expect(PASSWORD_RULES.length).toBeGreaterThan(0);
    expect(PASSWORD_RULES.join(" ")).toContain(String(MIN_PASSWORD_LENGTH));
  });
});

describe("the numbers the flows depend on", () => {
  it("keeps a reset link short-lived and single-purpose", () => {
    expect(PASSWORD_RESET_TTL_MINUTES).toBeGreaterThan(0);
    expect(PASSWORD_RESET_TTL_MINUTES).toBeLessThanOrEqual(60);
  });

  it("puts a floor under how often a reset may be asked for", () => {
    expect(PASSWORD_RESET_COOLDOWN_SECONDS).toBeGreaterThan(0);
  });

  it("locks an account before a guesser gets many tries, and lets it go again", () => {
    expect(MAX_FAILED_LOGINS).toBeGreaterThan(0);
    expect(MAX_FAILED_LOGINS).toBeLessThanOrEqual(10);
    // A lock somebody has to ring up to clear is a lock that gets switched off.
    expect(LOCKOUT_MINUTES).toBeGreaterThan(0);
    expect(LOCKOUT_MINUTES).toBeLessThanOrEqual(60);
  });

  it("names every way a session can end, with no duplicates", () => {
    const reasons = Object.values(SESSION_END_REASONS);
    expect(new Set(reasons).size).toBe(reasons.length);
  });
});
