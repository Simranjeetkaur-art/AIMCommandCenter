import { checkMailConfig } from "../src/mail";

const draft = {
  provider: "SMTP",
  fromName: "AIM Academy",
  fromEmail: "noreply@example.edu",
  host: "smtp.netcorecloud.net",
  port: 2525,
  username: "someone",
  secret: "x",
};

describe("checkMailConfig host", () => {
  it("accepts a bare hostname", () => {
    expect(checkMailConfig(draft, { hasStoredSecret: false }).ok).toBe(true);
  });

  it.each(["smtp.netcorecloud.net:2525", "smtp://smtp.example.com", "smtp.example.com/"])(
    "refuses %s, which would be looked up as a hostname",
    (host) => {
      const verdict = checkMailConfig({ ...draft, host }, { hasStoredSecret: false });
      expect(verdict.ok).toBe(false);
      expect(verdict.problems.join(" ")).toMatch(/without a port/);
    },
  );
});
