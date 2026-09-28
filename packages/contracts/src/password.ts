/**
 * What counts as a password here, and how long a sign-in may keep failing.
 *
 * This lives in contracts rather than in the API for the reason every rule in
 * this package does: the screen that collects a password and the server that
 * refuses it must apply the same rule, and the only way to guarantee that is
 * for there to be one rule. A form that accepts seven characters and a server
 * that demands eight is not a validation bug, it is two different products.
 *
 * The rules are published one by one (`evaluatePassword`) as well as as a
 * verdict (`checkPassword`), so a form can tick each one off while somebody
 * types. Both are built from the same predicates below, and a test holds them
 * to the same answer.
 */

/**
 * Eight, with a number and a special character alongside it.
 *
 * The minimum used to be twelve with no composition rule at all, on the
 * argument that length does the work. At eight it cannot do all of it, so the
 * number and the symbol make up the difference -- and the checks that refuse
 * the famous passwords and the person's own name still apply, because
 * `Password1!` satisfies any composition rule ever written.
 */
export const MIN_PASSWORD_LENGTH = 8;

/** How many different characters a password must contain. */
export const MIN_DISTINCT_CHARACTERS = 6;

/**
 * An upper bound, because argon2 hashes whatever it is given and a megabyte of
 * password is a way to make one request cost the server a great deal.
 */
export const MAX_PASSWORD_LENGTH = 200;

/** How long a reset link is good for. Short: it arrives by mail and is used at once. */
export const PASSWORD_RESET_TTL_MINUTES = 30;

/**
 * The gap enforced between one self-service reset request and the next for the
 * same account. Stops a form being used to post mail at somebody repeatedly.
 */
export const PASSWORD_RESET_COOLDOWN_SECONDS = 60;

/** Consecutive failures before an account stops answering, even to the right password. */
export const MAX_FAILED_LOGINS = 5;

/** How long that lock holds. It lifts by itself; nobody has to remember it. */
export const LOCKOUT_MINUTES = 15;

/**
 * The passwords that get tried first.
 *
 * A short list of roots, not a dictionary: the purpose is to refuse the
 * handful a person types when they are not really choosing one, and a real
 * breach corpus belongs behind an API rather than in a bundle shipped to a
 * browser.
 *
 * Matched case-insensitively and as substrings, which is deliberate and does
 * cost something -- it refuses an otherwise reasonable passphrase that happens
 * to contain "welcome1" or "abc123". That is the right side to err on: these
 * roots are what gets appended to and prefixed, and `Password2026!` is the
 * exact string a rule about composition would have waved through.
 */
const NOTORIOUS: readonly string[] = Object.freeze([
  "password",
  "passw0rd",
  "qwerty",
  "letmein",
  "changeme",
  "iloveyou",
  "welcome1",
  "admin123",
  "123456",
  "abc123",
  "aimacademy",
  "aimcommand",
]);

export interface PasswordSubject {
  /** Checked against, so a password cannot simply be the address it signs in with. */
  email?: string | null;
  /** Same, for the name on the account. */
  name?: string | null;
}

export interface PasswordVerdict {
  ok: boolean;
  /** Every reason it was refused, so the form can state them all at once. */
  problems: string[];
}

export type PasswordRuleId =
  | "length"
  | "number"
  | "symbol"
  | "variety"
  | "common"
  | "personal";

/** One rule, and whether a password meets it. */
export interface PasswordRuleStatus {
  id: PasswordRuleId;
  /** The rule as a sentence, for a form to show before anybody types. */
  label: string;
  /**
   * Whether the password meets it.
   *
   * `null` for the personal rule when there is no name or address to check
   * against. A form that cannot tell must not show a tick it has not earned;
   * the server, which knows who the account belongs to, still decides.
   */
  met: boolean | null;
}

const hasNumber = (password: string) => /[0-9]/.test(password);

/** Anything that is not a letter, a number or whitespace, in any script. */
const hasSymbol = (password: string) => /[^\p{L}\p{N}\s]/u.test(password);

// Whitespace only, or one character repeated, both clear the length bar and
// neither is a password. Distinct characters rather than character classes:
// "aaaaaaa1!" clears the composition rules and is not a password either.
const hasVariety = (password: string) =>
  password.trim().length > 0 &&
  new Set(password).size >= MIN_DISTINCT_CHARACTERS;

const isNotorious = (folded: string) =>
  NOTORIOUS.some((known) => folded === known || folded.includes(known));

/** Which parts of the person, if any, the password is built out of. */
function builtFrom(folded: string, subject: PasswordSubject) {
  const local = subject.email?.split("@")[0]?.toLowerCase().trim();

  // Each word of the name, so "Ada Lovelace" catches "adalovelace2026" and
  // "lovelacelovelace" alike. Two-letter words are skipped: refusing every
  // password containing "de" would be a rule about nothing.
  const words = (subject.name ?? "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 3);

  return {
    email: Boolean(local && local.length >= 3 && folded.includes(local)),
    name: words.some((word) => folded.includes(word)),
  };
}

/**
 * Every rule, each with whether this password meets it.
 *
 * What a form ticks off as somebody types. Leave `subject` out when the form
 * does not know whose password it is, and the personal rule comes back `null`
 * rather than falsely met.
 *
 * The one rule `checkPassword` has that this list does not is the upper bound
 * on length: nobody choosing a password reaches two hundred characters by
 * accident, and a checklist line for it would only be noise.
 */
export function evaluatePassword(
  password: string,
  subject?: PasswordSubject,
): PasswordRuleStatus[] {
  const folded = password.toLowerCase();
  const person = subject ? builtFrom(folded, subject) : null;

  return [
    {
      id: "length",
      label: `At least ${MIN_PASSWORD_LENGTH} characters`,
      met: password.length >= MIN_PASSWORD_LENGTH,
    },
    {
      id: "number",
      label: "At least one number (0–9)",
      met: hasNumber(password),
    },
    {
      id: "symbol",
      label: "At least one special character, like ! @ # $ %",
      met: hasSymbol(password),
    },
    {
      id: "variety",
      label: `At least ${MIN_DISTINCT_CHARACTERS} different characters`,
      met: hasVariety(password),
    },
    {
      id: "common",
      label: "Not a commonly used password",
      met: !isNotorious(folded),
    },
    {
      id: "personal",
      label: "Not your name or email address",
      met: person ? !person.email && !person.name : null,
    },
  ];
}

/**
 * Checks a proposed password.
 *
 * Returns every problem rather than the first, because a form that reveals one
 * rule at a time turns choosing a password into a guessing game.
 */
export function checkPassword(
  password: string,
  subject: PasswordSubject = {},
): PasswordVerdict {
  const problems: string[] = [];

  if (password.length < MIN_PASSWORD_LENGTH) {
    problems.push(
      `Use at least ${MIN_PASSWORD_LENGTH} characters. A phrase you can remember beats a short string you cannot.`,
    );
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    problems.push(`Keep it under ${MAX_PASSWORD_LENGTH} characters.`);
  }
  if (!hasNumber(password)) {
    problems.push("Include at least one number (0–9).");
  }
  if (!hasSymbol(password)) {
    problems.push("Include at least one special character, like ! @ # $ %.");
  }
  if (!hasVariety(password)) {
    problems.push(
      password.trim().length === 0
        ? "A password cannot be only spaces."
        : `Use at least ${MIN_DISTINCT_CHARACTERS} different characters.`,
    );
  }

  const folded = password.toLowerCase();
  if (isNotorious(folded)) {
    problems.push("That is one of the first passwords anyone tries.");
  }

  const person = builtFrom(folded, subject);
  if (person.email) {
    problems.push("Do not build it out of your own email address.");
  }
  if (person.name) {
    problems.push("Do not build it out of your own name.");
  }

  return { ok: problems.length === 0, problems };
}

/**
 * The rules, as prose, for a form to show *before* somebody types rather than
 * after they are refused.
 */
export const PASSWORD_RULES: readonly string[] = Object.freeze(
  evaluatePassword("").map((rule) => `${rule.label}.`),
);

/**
 * Why a session ended, recorded on the row.
 *
 * "Your session ended" is a much worse thing to read than "you changed your
 * password on another device", and the difference is one column.
 */
export const SESSION_END_REASONS = {
  SIGNED_OUT: "signed-out",
  PASSWORD_CHANGED: "password-changed",
  PASSWORD_RESET: "password-reset",
  ENDED_BY_ADMIN: "ended-by-administrator",
  ROLE_CHANGED: "role-changed",
  ACCOUNT_SUSPENDED: "account-suspended",
  ACCOUNT_ARCHIVED: "account-archived",
  ENDED_BY_OWNER: "ended-by-owner",
} as const;

export type SessionEndReason =
  (typeof SESSION_END_REASONS)[keyof typeof SESSION_END_REASONS];

/**
 * The code the API returns when a session is good but the password behind it
 * must be changed before anything else happens.
 *
 * A string rather than a bare 403 because the web application has to tell this
 * case apart from an ordinary refusal: one sends the person to the password
 * screen, the other is a permission boundary doing its job.
 */
export const PASSWORD_CHANGE_REQUIRED = "PASSWORD_CHANGE_REQUIRED";
