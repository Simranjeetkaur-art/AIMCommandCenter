import type { Role } from "./roles";

/**
 * The profile a person completes on first sign-in.
 *
 * Until it is complete, the account is held at the profile screen: the API
 * refuses everything but the few routes that screen needs, the same way it
 * holds an account at the password screen. One set of rules, used by the form
 * and by the API, so the two cannot disagree about what "complete" means.
 */

/**
 * The code the API returns while a profile is incomplete.
 *
 * Distinct from an ordinary 403 for the reason PASSWORD_CHANGE_REQUIRED is: one
 * sends the person to the profile screen, the other is a permission boundary.
 */
export const PROFILE_REQUIRED = "PROFILE_REQUIRED";

/**
 * Who is held until their profile is complete. Administrators are not: they
 * are the ones who fix everybody else's account, and must never be locked out
 * of the screens that do it.
 */
export const PROFILE_REQUIRED_ROLES: readonly Role[] = Object.freeze([
  "STUDENT",
  "INSTRUCTOR",
  "MANAGER",
]);

export function profileRequiredFor(role: Role): boolean {
  return PROFILE_REQUIRED_ROLES.includes(role);
}

export interface ProfileFields {
  organisation: string;
  jobTitle: string;
  country: string;
  phone: string;
  address: string;
}

export const PROFILE_LIMITS = Object.freeze({
  organisation: 160,
  jobTitle: 120,
  country: 80,
  phone: 32,
  address: 500,
});

/** Digits, spaces and the usual separators; 7 to 15 digits in all (E.164). */
const PHONE = /^\+?[0-9 ()\-.]+$/;

export type ProfileVerdict =
  | { ok: true; profile: ProfileFields }
  | { ok: false; problems: string[] };

/**
 * Every field is required, trimmed, and bounded. All problems are reported at
 * once, so the form can list them rather than revealing them one per submit.
 */
export function checkProfile(input: Partial<Record<keyof ProfileFields, unknown>>): ProfileVerdict {
  const value = (key: keyof ProfileFields) =>
    typeof input[key] === "string" ? (input[key] as string).trim() : "";

  const profile: ProfileFields = {
    organisation: value("organisation"),
    jobTitle: value("jobTitle"),
    country: value("country"),
    phone: value("phone"),
    address: value("address"),
  };

  const problems: string[] = [];
  const labels: Record<keyof ProfileFields, string> = {
    organisation: "Organisation",
    jobTitle: "Job title",
    country: "Country",
    phone: "Phone number",
    address: "Address",
  };

  for (const key of Object.keys(labels) as Array<keyof ProfileFields>) {
    if (!profile[key]) {
      problems.push(`${labels[key]} is required.`);
    } else if (profile[key].length > PROFILE_LIMITS[key]) {
      problems.push(
        `${labels[key]} must be at most ${PROFILE_LIMITS[key]} characters.`,
      );
    }
  }

  if (profile.phone) {
    const digits = profile.phone.replace(/\D/g, "").length;
    if (!PHONE.test(profile.phone) || digits < 7 || digits > 15) {
      problems.push(
        "Phone number should be 7 to 15 digits, optionally starting with + and a country code.",
      );
    }
  }

  return problems.length ? { ok: false, problems } : { ok: true, profile };
}
