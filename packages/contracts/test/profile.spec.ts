import {
  checkProfile,
  PROFILE_LIMITS,
  profileRequiredFor,
} from "../src";

const complete = {
  organisation: "Acme Assurance",
  jobTitle: "Risk Manager",
  country: "United Kingdom",
  phone: "+44 20 7946 0000",
  address: "1 Example Street\nLondon",
};

describe("the first-sign-in profile", () => {
  it("holds students, instructors and managers, never administrators", () => {
    expect(profileRequiredFor("STUDENT")).toBe(true);
    expect(profileRequiredFor("INSTRUCTOR")).toBe(true);
    expect(profileRequiredFor("MANAGER")).toBe(true);
    expect(profileRequiredFor("ADMIN")).toBe(false);
  });

  it("accepts a complete profile and trims it", () => {
    const verdict = checkProfile({ ...complete, country: "  United Kingdom " });
    expect(verdict.ok).toBe(true);
    if (verdict.ok) expect(verdict.profile.country).toBe("United Kingdom");
  });

  it("lists every missing field at once", () => {
    const verdict = checkProfile({ organisation: "  " });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.problems).toHaveLength(5);
  });

  it("refuses non-strings rather than coercing them", () => {
    const verdict = checkProfile({ ...complete, phone: 4420 as unknown as string });
    expect(verdict.ok).toBe(false);
  });

  it("checks the phone number's shape and length", () => {
    expect(checkProfile({ ...complete, phone: "call me" }).ok).toBe(false);
    expect(checkProfile({ ...complete, phone: "12345" }).ok).toBe(false);
    expect(checkProfile({ ...complete, phone: "(020) 7946-0000" }).ok).toBe(true);
  });

  it("bounds every field", () => {
    const verdict = checkProfile({
      ...complete,
      address: "x".repeat(PROFILE_LIMITS.address + 1),
    });
    expect(verdict.ok).toBe(false);
  });
});
