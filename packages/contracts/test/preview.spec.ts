import {
  ALL_ROLES,
  PERMISSIONS as P,
  PREVIEW_LENDABLE,
  PREVIEW_WITHHELD,
  PROHIBITIONS,
  canPreview,
  permissionsFor,
  previewPermissionsFor,
} from "../src";

describe("role preview", () => {
  /**
   * The load-bearing property. Preview narrows; it never widens. If this fails,
   * preview has become a way to hold authority you were not granted, which is
   * the thing the whole permission matrix exists to prevent.
   */
  it("never grants a permission the previewed role does not hold", () => {
    for (const role of ALL_ROLES) {
      const held = new Set<string>(permissionsFor(role));
      for (const permission of previewPermissionsFor(role)) {
        expect(held.has(permission)).toBe(true);
      }
    }
  });

  it("grants nothing but reads", () => {
    const lendable = new Set<string>(PREVIEW_LENDABLE);
    for (const permission of PREVIEW_WITHHELD) {
      expect(lendable.has(permission)).toBe(false);
    }
  });

  /**
   * Preview must not become a way around the "cannot do" column. Previewing a
   * role can only ever hand out that role's own reads, so a prohibition on the
   * *previewed* role is the one that has to hold.
   */
  it("respects every prohibition on the role being previewed", () => {
    for (const { role, permission } of PROHIBITIONS) {
      expect(previewPermissionsFor(role)).not.toContain(permission);
    }
  });

  it("never lends the answer key, whichever role is previewed", () => {
    for (const role of ALL_ROLES) {
      expect(previewPermissionsFor(role)).not.toContain(P.ANSWER_KEY_READ);
    }
  });

  it("never lends a judgement", () => {
    const judgements = [
      P.REVIEW_APPROVE,
      P.REVIEW_GRADE,
      P.REVIEW_RETURN,
      P.BADGE_AWARD,
    ];
    for (const role of ALL_ROLES) {
      for (const judgement of judgements) {
        expect(previewPermissionsFor(role)).not.toContain(judgement);
      }
    }
  });

  it("never lends control of a credential", () => {
    const lifecycle = [
      P.CREDENTIAL_ISSUE,
      P.CREDENTIAL_SUSPEND,
      P.CREDENTIAL_REVOKE,
      P.CREDENTIAL_REINSTATE,
    ];
    for (const role of ALL_ROLES) {
      for (const permission of lifecycle) {
        expect(previewPermissionsFor(role)).not.toContain(permission);
      }
    }
  });

  it("leaves an administrator with less than they started with", () => {
    const real = permissionsFor("ADMIN");
    for (const role of ALL_ROLES) {
      if (role === "ADMIN") continue;
      expect(previewPermissionsFor(role).length).toBeLessThan(real.length);
    }
  });

  it("still lets the previewer read a programme, so the session can be read back", () => {
    // Every portal page calls /auth/me, which is gated on programme.read.
    // Without this the preview would sign the actor out of their own session.
    for (const role of ALL_ROLES) {
      expect(previewPermissionsFor(role)).toContain(P.PROGRAMME_READ);
    }
  });

  it("refuses to preview the role you already are", () => {
    for (const role of ALL_ROLES) {
      expect(canPreview(role, role)).toBe(false);
    }
    expect(canPreview("ADMIN", "INSTRUCTOR")).toBe(true);
  });

  it("gives an instructor preview the queue an instructor actually sees", () => {
    const preview = previewPermissionsFor("INSTRUCTOR");
    expect(preview).toContain(P.REVIEW_QUEUE_READ);
    expect(preview).toContain(P.SUBMISSION_READ_ASSIGNED);
    // and not the acts that follow from reading it
    expect(preview).not.toContain(P.REVIEW_CLAIM);
  });

  it("gives a student preview no sight of anyone else", () => {
    const preview = previewPermissionsFor("STUDENT");
    expect(preview).not.toContain(P.PROGRESS_READ_ALL);
    expect(preview).not.toContain(P.SUBMISSION_READ_ALL);
    expect(preview).not.toContain(P.USER_READ);
  });
});
