import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Walks every controller in the codebase and asserts that each HTTP route
 * carries a declaration: @RequirePermissions, @RequireAnyPermission, or an
 * explicit @Public.
 *
 * PermissionsGuard already refuses an undeclared route at runtime. This test
 * makes the failure happen at build time instead of on a caller, and it is the
 * mechanical version of the claim that every route carries a declared,
 * testable permission.
 */
const SRC = join(__dirname, "..", "src");
const HTTP_DECORATOR = /^\s*@(Get|Post|Put|Patch|Delete|All)\(/;
const DECLARATION = /@(RequirePermissions|RequireAnyPermission|Public)\(/;

function controllerFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return controllerFiles(full);
    return entry.endsWith(".controller.ts") ? [full] : [];
  });
}

interface Route {
  file: string;
  line: number;
  verb: string;
  handler: string;
  declared: boolean;
}

function routesIn(file: string): Route[] {
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  const routes: Route[] = [];

  lines.forEach((line, index) => {
    const match = HTTP_DECORATOR.exec(line);
    if (!match) return;

    // Decorators on a handler sit in one unbroken run above the signature.
    // Walk up and down from the HTTP decorator to collect the whole run.
    let declared = false;
    for (let i = index - 1; i >= 0 && lines[i].trim().startsWith("@"); i -= 1) {
      if (DECLARATION.test(lines[i])) declared = true;
    }
    let cursor = index + 1;
    while (cursor < lines.length && lines[cursor].trim().startsWith("@")) {
      if (DECLARATION.test(lines[cursor])) declared = true;
      cursor += 1;
    }

    routes.push({
      file: file
        .slice(SRC.length + 1)
        .split(String.fromCharCode(92))
        .join(String.fromCharCode(47)),
      line: index + 1,
      verb: match[1],
      handler: (lines[cursor] ?? "").trim().split("(")[0] || "unknown",
      declared,
    });
  });

  return routes;
}

const allRoutes = controllerFiles(SRC).flatMap(routesIn);

describe("every route declares who it is for", () => {
  it("finds routes to check at all, so a passing suite means something", () => {
    expect(allRoutes.length).toBeGreaterThan(30);
  });

  it.each(
    allRoutes.map(
      (r) => [`${r.file}:${r.line} ${r.verb} ${r.handler}`, r] as const,
    ),
  )("%s", (_label, route) => {
    expect(route.declared).toBe(true);
  });

  it("keeps @Public to the few routes that are genuinely unauthenticated", () => {
    const publicRoutes = controllerFiles(SRC).flatMap((file) => {
      const text = readFileSync(file, "utf8");
      const count = (text.match(/@Public\(\)/g) ?? []).length;
      return count > 0 ? [{ file: file.slice(SRC.length + 1), count }] : [];
    });

    const total = publicRoutes.reduce((n, r) => n + r.count, 0);
    /**
     * Eight, and each one is a decision rather than a diff nobody noticed:
     *
     *   auth.login                  exchanging credentials for a session
     *   health                      liveness, which cannot require a session
     *   credentials.verify          a credential anyone may check is the point
     *   auth.password/forgot        asking for a reset link
     *   auth.password/reset         spending one
     *   auth.register               enrolling yourself
     *   auth.verify                 confirming an address
     *   auth.verify/resend          asking for another confirmation link
     *
     * Four and five were added with the password flows, and they are public
     * for the unavoidable reason: somebody who cannot sign in cannot present a
     * session. Both are built so that being public costs nothing. `forgot`
     * answers identically for an address that exists and one that does not, so
     * it is not an oracle on the roll; `reset` is guarded by the token itself,
     * which is single-use, dies in thirty minutes, and is stored only as a
     * hash under its own domain separator.
     *
     * The sixth is `register`, and here is the argument the note below this
     * one asked for. It is public for the same unavoidable reason -- somebody
     * without an account cannot present a session -- so what has to be shown
     * is that being public costs little:
     *
     *   - **It cannot mint authority.** The role is not an input. It is read
     *     from `SELF_REGISTRATION_ROLE` in the contract, and `RegisterDto`
     *     declares no role field, so `forbidNonWhitelisted` rejects a request
     *     carrying one before the service is even reached. Two independent
     *     layers, and the worst outcome of defeating both is another student,
     *     which is a role holding no permission over anybody else record.
     *   - **It can be closed** by an administrator, with a feature flag, with
     *     no deploy.
     *   - **It cannot be worked in bulk.** A separate, much tighter origin
     *     brake than the sign-in one, counted on every attempt rather than
     *     only on successes.
     *   - **It is not silent.** Every enrolment writes `auth.register` to the
     *     append-only log with the new account as the actor, and leaves
     *     `createdById` null, which is how the roll distinguishes somebody an
     *     administrator vouched for from somebody who walked in.
     *
     * It does confirm whether an address is already registered, which the
     * other public routes refuse to do. That is a considered trade and the
     * reasoning is at the check itself in `AuthService.register`.
     *
     * The seventh and eighth are `auth/verify` and `auth/verify/resend`,
     * added with email verification, and they are public for the reason that
     * makes all of these public: a person who has not confirmed their address
     * has no session, and the flow exists precisely to get them one.
     *
     *   - `verify` is guarded by the token, exactly as `password/reset` is.
     *     It is single use, it expires in a day, it is stored only as a hash
     *     under its own domain separator -- a separator that is *not* the
     *     reset one, so a confirmation link cannot be presented at the reset
     *     endpoint or the reverse. Spending it confirms an address; it cannot
     *     set a password, and it cannot confirm an address other than the one
     *     the row names.
     *   - `verify/resend` answers identically for an address that exists, one
     *     that does not, and one that is already confirmed, so it is not an
     *     oracle on the roll. It is rate-limited by a per-account cooldown, so
     *     it cannot be used to post mail at somebody repeatedly.
     *
     * Note what is *not* public: nothing that reads or writes a record. Six of
     * the eight are the authentication flows, one is liveness, and one is
     * credential verification, which is public on purpose.
     *
     * A ninth should be argued for here before it is written.
     */
    expect(total).toBeLessThanOrEqual(8);
  });
});
