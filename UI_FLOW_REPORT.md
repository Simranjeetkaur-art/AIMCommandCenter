# AIM Command Center — UI flow report

Run: 2026-09-26, 07:21–08:12 UTC, against the pm2 production builds (web :3000, API :4000).
Driver: Playwright 1.63 / Chromium, one browser context per actor, installed in the session scratch
directory (not the repo). Every step was screenshotted; console errors, page errors and every HTTP
response ≥ 400 were recorded per step.

- **DB backup taken before any step:** `.db-backups/before-ui-flow-20260926-0721.dump`
  (pg_dump -Fc, 389 KB, 265 TOC entries). Not restored.
- **Screenshots:** `/tmp/claude-1000/-opt-aim/c4e0ecc0-ab7c-45cf-a62a-db388ebf42eb/scratchpad/shots/`
  (203 files), referred to below as `shots/<name>.png`. This is a session scratch directory; copy
  it if the images need to outlive the session.
- **Mail:** `/admin/mail` showed a real SMTP provider configured but **sending OFF**. No mail could
  be sent, and none was. Mail settings were not touched.
- **No server was restarted, rebuilt, re-seeded or migrated.**
- `student@aim.edu` was used read-only (0 assessment attempts used of the 1 allowed). No seeded
  account was locked, suspended, archived or had a session ended.
- Every reason/rationale typed carries the prefix `QA-FLOW:`; every created record carries
  `QA-FLOW-20260926`; every created user is `@aim.test`.

Substitutions forced by the environment (see **Blocked**):
`qa-flow-cand2@aim.test` (admin-created) stands in for the self-registered `qa-flow-cand1`, and
`qa-flow-instr2@aim.test` stands in for `instructor2@aim.edu`, because neither self-registered nor
three of the seeded accounts can sign in.

---

## 1 · Summary

| Flow | Result | Steps passed / total | Worst severity |
| --- | --- | --- | --- |
| F1 · Self-enrolment → verification → first sign-in | **FAIL** (partly BLOCKED) | 8 / 14 | critical |
| F2 · Learner journey | **FAIL** | 6 / 12 | major |
| F3 · Command simulator | **FAIL** | 6 / 8 | minor |
| F4 · Submission → review → revise → approve | **FAIL** | 14 / 23 | major |
| F5 · Certification → credential → verify → revoke | **FAIL** | 9 / 13 | major |
| F6 · Governance Dx → Rx → registry | **FAIL** | 6 / 11 | major |
| F7 · Authoring → publish → learner | **FAIL** | 11 / 22 | major |
| F8 · User lifecycle | **FAIL** | 15 / 24 | major |
| F9 · Password reset | **PASS** (self-service link BLOCKED) | 8 / 9 | — |
| F10 · Role preview | **FAIL** | 7 / 12 | major |
| F11 · Performance notes | **FAIL** | 6 / 7 | major |
| §2 · Across every flow | **FAIL** | 4 / 7 | major |

Step totals are the PASS / FAIL / BLOCKED lines counted in section 2.

The findings that matter most:

1. **Critical — `/register` is an account oracle.** Registering an existing address says
   *"An account already exists for that address."* (UI and API, reproduced twice).
2. **A systemic error-handling defect.** When the API refuses a write made through a form, the web
   tier throws it and the user sees the generic *"That page could not be loaded … Nothing was
   changed."* screen. The server's precise message is thrown away, and "Nothing was changed" is
   sometimes false. It hit user creation, agent registration, badge deletion, role-preview refusals
   and module creation.
3. **Confirm steps are missing on most destructive admin actions:** credential suspend and revoke
   (permanent), user suspend, archive and role change, badge delete. Most danger buttons are red only on hover.
4. **Business rules the UI promises but does not enforce.**
   - A credential is issued with 3 of 5 certification requirements met.
   - A locked track's lesson can be read and completed by deep link.
   - The written-practical attempt limit is not counted.
   - A double-click submits a practical twice.
5. **Features unreachable from the UI:**
   - No way to bind a diagnostic to an agent.
   - No way to reassign a non-overdue review.
   - A published new track never appears on the student academy.
   - No way for an admin to confirm an unverified email. Three seeded accounts are stuck because of this.

---

## 2 · Per flow

### F1 · Self-enrolment → verification → first sign-in

PASS — `/admin/mail`: provider "Custom SMTP server" configured, sending **OFF**, auto-enrol **on**, intake cohort **None**. Recorded, not changed. (`shots/F1-01-admin-mail.png`)
PASS — Signed-out `/` offers "Sign up" / "Create account" → `/register`. (`shots/F1-02-landing.png`)
PASS — Empty submit, whitespace-only name, malformed email, weak password and mismatched confirmation are each refused with a specific message, and every broken password rule is listed at once. (`shots/F1-04…07`)
FAIL — Registering an existing address reveals that the account exists.

```
FAIL — /register tells anyone whether an email address has an account.
  Where:    /register (form) and POST /api/auth/register
  Role:     signed out
  Steps:    1. Open /register. 2. Name "QA-FLOW-20260926 Cand One", email student@aim.edu,
            password Tr7#mesa-Vektor twice. 3. Create account. (Re-run with admin@aim.edu: same.)
  Expected: The same outcome as for a new address (e.g. "check your inbox"). The brief requires
            that registering an existing address not reveal it exists; /login/forgot and
            /verify resend already follow this rule.
  Actual:   "An account already exists for that address. Sign in, or reset the password."
            API: HTTP 400 with the same message; a new address gets the success screen.
  Severity: critical
  Shots:    shots/F1-08-register-existing.png, shots/F1-20-register-oracle-rerun.png
```

PASS — Registering `qa-flow-cand1@aim.test` creates the account and says a confirmation is needed. (`shots/F1-09-register-new.png`)
FAIL — The success message misstates the mail setup.

```
FAIL — Registration success screen says no mail provider is configured, but one is (switched off).
  Where:    /register, success state
  Role:     signed out
  Steps:    Register a new @aim.test address while /admin/mail shows a provider with sending OFF.
  Expected: Wording that matches the state ("sending is switched off"), or neutral wording.
  Actual:   "This academy has no mail provider configured yet … Ask an administrator to confirm
            your address" — and no administrator control to confirm an address exists (next FAIL).
  Severity: minor
  Shots:    shots/F1-09-register-new.png
```

BLOCKED — Obtain the verification link: mail is off, and the API runs with `NODE_ENV=production`, which by design never logs the link (`pm2 logs aim-api` shows only *"verify to qa-flow-cand1@aim.test failed: Outbound mail is configured but switched off."*).
BLOCKED — `/verify?token=<real>` signs in and lands on the student home; re-opening a spent link explains itself (same cause).
PASS — `/verify?token=garbage` explains ("That is not a confirmation link") and offers "Send a new link"; `/verify` with no token does the same. (`shots/F1-10…11`)
PASS — Resend for a known and an unknown address gives byte-identical screens. (`shots/F1-13-resend-*.png`)
PASS — Sign-in by the unverified candidate with the right password says to confirm the email first; a wrong password gives the generic refusal. (`shots/F1-12-login-unverified.png`)
FAIL — An administrator has no way to see or resolve an unverified address. The same state blocks three seeded accounts.

```
FAIL — Unverified accounts cannot be unblocked from the UI; student2, student3 and instructor2 cannot sign in.
  Where:    /admin/users/[id]; POST /api/auth/login
  Role:     ADMIN (admin@aim.edu); seeded users
  Steps:    1. Sign in as instructor2@aim.edu / AimAcademy!2026 → "Confirm your email address
            before signing in." 2. Same for student2@ and student3@ (API: HTTP 403, same message).
            3. As admin open /admin/users/<id> for any of them, or for qa-flow-cand1.
  Expected: The record shows the email as unconfirmed and offers a recorded way to confirm it or
            re-send, which the register screen promises ("Ask an administrator to confirm your
            address"). Seeded multi-user accounts should be usable: the brief relies on them.
  Actual:   The record shows no verification state and no confirm action. An admin-issued reset
            link does not verify the address either. With mail off, every self-registered
            candidate and these three seeded accounts are permanently locked out.
  Severity: major
  Shots:    shots/F1-15-admin-user-cand1.png, shots/F1-12-login-unverified.png
```

PASS — Auto-enrol: with no intake cohort set, the candidate is not enrolled. `/manager/learners` lists them with no cohort, as `/admin/mail` says. (`shots/F1-17-manager-learners.png`)
BLOCKED — The candidate sees only their own record after first sign-in (they can never sign in; see above).

### F2 · Learner journey (as `qa-flow-cand2`; `student@aim.edu` read-only)

PASS — `/student` → `/student/academy` → AIM-CP track → CP-001 lesson renders for both learners. (`shots/F2-02…05`)
PASS — Mark complete on CP-001 moves home (0→1/10), the academy card (0→1/10) and the track's MODULES COMPLETE (0→1/10) by the same amount. (`shots/F2-07-track-after.png`)
FAIL — The lesson page never shows that it is complete.

```
FAIL — /student/lessons/[id] shows an enabled "Mark complete" forever, even after completion.
  Where:    /student/lessons/453aa317-… (CP-001)
  Role:     STUDENT (qa-flow-cand2; also student@aim.edu, who completed all 10)
  Steps:    1. Click Mark complete. 2. Page shows no change. 3. Reload: still "Mark complete",
            enabled, no completed state. 4. student@ (10/10 complete) sees the same.
  Expected: A visible completed state (or a disabled / "Completed" control). The action must
            have a visible result.
  Actual:   No feedback on click and no persisted state on the page; only the track card shows "READ".
  Severity: major
  Shots:    shots/F2-06-lesson1-complete.png, shots/F2-08-lesson1-reload.png, shots/F2-09-student-lesson1-completed.png
```

PASS — The assessment page and the begun paper hold no key: the HTML/RSC payload has no `correct*`, `answerKey` or explanation text, and `GET /api/assessments/:id/paper` returns only `id,code,title,kind,passMark,…,questions,readiness`. (`shots/F2-10…11`)
PASS — Submit shows score and pass/fail; attempts used vs limit updates each time (1/5 → 5/5). (`shots/F2-13…15`)
PASS — The 6th attempt is refused: the UI says "No attempts remaining. Speak to your instructor."; the API gives HTTP 400 "No attempts remaining (5 used)".
FAIL — Controls still offer another attempt when none are left.

```
FAIL — "Attempt again" heading and a "Retake" link are shown with 0 of 5 attempts remaining.
  Where:    /student/assessments/[id] header; /student/academy/AIM-CP module row
  Role:     STUDENT (qa-flow-cand2)
  Steps:    Use all 5 attempts on CP-001-ASSESS; view the assessment and the track.
  Expected: No affordance for an action the server will refuse.
  Actual:   "Attempt again" heading and "Retake" link remain; only the body text says none remain.
  Severity: minor
  Shots:    shots/F2-15-attempts-exhausted.png, shots/F2-19-track-after-pass.png
```

PASS — `/student/assessments` shows CP-001 100% PASSED, 0 of 5 remaining. (`shots/F2-18-assessments.png`)
FAIL — Badge figures disagree between screens.

```
FAIL — Track page says "BADGE EARNED" / "MODULE BADGES 1 / 10"; /student/badges and home say no badge.
  Where:    /student/academy/AIM-CP vs /student/badges vs /student
  Role:     STUDENT (qa-flow-cand2), after passing CP-001-ASSESS
  Steps:    Pass CP-001-ASSESS; compare the three screens.
  Expected: One figure. Doctrine: a tile that disagrees with the screen behind it is worse than none.
  Actual:   Track: BADGE EARNED, MODULE BADGES 1/10. Badges page: EARNED 0. Home: "No badges yet."
            (Module badges may be a separate concept, but no screen says so. Unsure if deliberate.)
  Severity: minor
  Shots:    shots/F2-19-track-after-pass.png, shots/F2-17-badges.png
```

FAIL — Locked tracks could not be tested: AIM-CA and AIM-EL are **OPEN**, even while the CA card says "Requires AIM-CP™".

```
FAIL — AIM-CA card shows "Requires AIM-CP™" but is OPEN with "START TRAINING"; no track is locked.
  Where:    /student/academy; /manager ("open to everyone"); /authoring
  Role:     STUDENT (qa-flow-cand2, holding no AIM-CP credential at the time)
  Steps:    Open /student/academy as a candidate with no credential.
  Expected: Either the prerequisite is enforced and the card says what unlocks it, or the chip is
            not shown. Resembles known issue #1 but differs: the track is not locked at all
            (unlock policy appears to be "open to everyone"), and student@ is now enrolled on AIM-CA.
  Actual:   Chip "Requires AIM-CP™" alongside status OPEN.
  Severity: minor (unsure — the open policy may be deliberate configuration)
  Shots:    shots/F2-03-cand2-academy.png
```

**RETRACTED (test error, see §7)** FAIL — Level badge not awarded: `LEVEL1_HALFWAY` ("Completes N modules at a given level — 5") was never awarded to `cand2` after 10/10 AIM-CP modules, though the track-based `CP_FOUNDATIONS` (3 modules) was. This resembles known issue #1 (module counting against a version), but it affects badges, not unlock rules. Severity: minor, unsure. (`shots/F5-05-cert-center-after.png`)
BLOCKED — Repeating the key steps as `qa-flow-cand1` (cannot sign in; see F1).

### F3 · Command simulator (as `qa-flow-cand2`)

PASS — `/student/simulator` → Enter → Begin run: one run is created (double-click gave one run, 4 of 5 remaining). (`shots/F3-01…03`)
PASS — A debrief ("Correct command decision … WHY THIS IS THE COMMAND DECISION") appears after each decision. (`shots/F3-04-debrief1.png`)
PASS — Leaving mid-run and returning is explicit: the list shows "IN PROGRESS · Mission 4 of 20 · Resume run", and the run resumes at mission 4. (`shots/F3-05…06`)
PASS — The finished run shows 100% vs pass 80%, PASS; this persists after reload. (`shots/F3-07-sim-finished.png`)
PASS — The result appears on the simulator list, the track gate (✓ 100-Mission Command Simulator), the certification center (1 of 1 cleared), home, and as the badge "100-Mission Commander". (`shots/F3-08…09`)
FAIL — The last mission's debrief is skipped.

```
FAIL — After the 20th decision the page jumps to the run summary; the final debrief is never shown.
  Where:    /student/simulator/[id] → ?review=1
  Role:     STUDENT (qa-flow-cand2), run 2
  Steps:    Fly missions 1–19, answer mission 20.
  Expected: The same debrief as every other mission, then the result.
  Actual:   Straight to the "Your runs" summary; the ?review=1 URL suggests a review view that never renders.
  Severity: minor
  Shots:    shots/F3-10-mission20-after-answer.png
```

FAIL — Mission count is inconsistent: the track and gate call it the "100-Mission Command Simulator" / "100 items", while the simulator says "20 missions" per run (drawn from a pool of 100). Wording; severity: cosmetic. (`shots/F3-01-simulator.png`, `shots/F2-04-cand2-track-cp.png`)
PASS — No console errors or hydration warnings during the flow.

### F4 · Practical submission → review → revise → approve

Note: none of the AIM-CP papers is examiner-reviewed (see the first FAIL below), so the flow used **CA-PRACTICAL**. `cand2` was enrolled on AIM-CA-2026A by the manager, with Tomas Lindqvist (`instructor@`) as examiner.

FAIL — The student-facing copy promises examiner review for papers that are auto-marked.

```
FAIL — "Written milestones go to an examiner" / check ride "before an examiner", but CP-PRACTICAL and CP-CHECKRIDE are auto-marked multiple choice.
  Where:    /student/academy/AIM-CP, /student/certification, /authoring/tracks/* ("A practical,
            capstone or defence goes to an examiner")
  Role:     STUDENT (qa-flow-cand2)
  Steps:    Open CP-PRACTICAL (Practical Dx/Rx) and CP-CHECKRIDE: 10 and 5 radio questions,
            marked instantly (practical scored 70%, not passed). Builder shows requiresReview=false.
  Expected: The copy matches how the paper is marked, or these papers are examiner-reviewed as the
            certification description says.
  Actual:   The practical requirement for AIM-CP can be cleared by a multiple-choice quiz.
  Severity: major (unsure whether the seed configuration is deliberate)
  Shots:    shots/F4-02-practical.png, shots/F4-03-practical-paper.png, shots/F4-04-practical-submitted.png
```

PASS — CA-PRACTICAL presents a written submission (min 80 chars) that "goes to an examiner". (`shots/F4-09-ca-practical.png`)
FAIL — A double-click creates two submissions.

```
FAIL — Double-clicking "Submit for examiner review" creates two submissions.
  Where:    /student/assessments/e4e9ab40-… (CA-PRACTICAL)
  Role:     STUDENT (qa-flow-cand2)
  Steps:    Fill the text, double-click "Submit for examiner review". Re-run once: same.
  Expected: Exactly one action (pending/disabled state or server idempotency).
  Actual:   Two SUBMITTED rows 44 ms apart (52df2b6d, 83a1053a); the re-run created two more
            (a31ab0ee, ca9b7cd6). All four landed in the examiner's queue.
  Severity: major
  Shots:    shots/F4-10-submitted.png, shots/F4-12-rerun-doubleclick.png
```

FAIL — The attempt limit on written submissions is not counted.

```
FAIL — Four CA-PRACTICAL submissions made; the page still says "3 of 3 attempts remaining".
  Where:    /student/assessments/e4e9ab40-…
  Role:     STUDENT (qa-flow-cand2)
  Steps:    Submit the written practical (4 rows exist after the double-click checks).
  Expected: Each submission counts against the limit of 3, and the 4th is refused.
  Actual:   "3 of 3 attempts remaining"; the server accepted all four.
  Severity: major
  Shots:    shots/F4-12-rerun-doubleclick.png
```

PASS — `<script>alert(1)</script>` and a `javascript:` markdown link in the submission render as text on every screen (instructor review, student detail); no script element, no `javascript:` href. (`shots/F4-18-review-page.png`)
PASS — The assigned instructor sees the item in `/instructor`. (`shots/F4-13-instructor-queue.png`)
PASS — The unassigned instructor (`qa-flow-instr2`, standing in for instructor2) does not see it in the queue. (`shots/F4-15-qi2-queue.png`)
FAIL — The unassigned instructor's direct link returns 500, not 404.

```
FAIL — /instructor/review/[id] returns HTTP 500 for an unassigned, a non-existent and a garbage id.
  Where:    /instructor/review/52df2b6d-… , /00000000-…, /garbage
  Role:     INSTRUCTOR (qa-flow-instr2@aim.test, not assigned)
  Steps:    Open each URL directly (re-run once: same).
  Expected: 404 (the codebase deliberately hides existence); the API does return 404 "Learner not found".
  Actual:   500 "SOMETHING WENT WRONG … Nothing was changed." for all three. They are identical,
            so there is no existence oracle, but a 500 on an [id] route is a finding. The same
            happens for a learner opening an unreleased /performance/[id] (F11) and in instructor
            preview (F10).
  Severity: major
  Shots:    shots/F4-16-qi2-direct.png, shots/F4-17-qi2-garbage.png
```

PASS — Claim works; a double-click on Claim gives one claim.
PASS — A rationale under 40 characters is refused: the button stays disabled with a live counter ("38 / 40"), and the server refuses (HTTP 400). Padding with spaces is also refused on both sides. (`shots/F4-20-return-short.png`)
PASS — A valid 40+ character rationale returns the work. The second click of a double-click was denied server-side ("Claim this item before deciding it"), so only one action happened.
FAIL — The instructor gets no confirmation that the decision was recorded; the page silently returns to the queue. Severity: minor. (`shots/F4-21-returned.png`)
PASS — The student sees RETURNED with the full rationale; the rationale's `<script>` renders as text. (`shots/F4-22…23`)
PASS — Revise and resubmit creates V2; a double-click gave one V2 (the second POST was refused). (`shots/F4-24-resubmitted.png`)
FAIL — Submitted work cannot be reopened by the student: rows in `/student/submissions` link to the detail page only once returned or decided. SUBMITTED rows are plain text, so a student cannot re-read what they sent. Severity: minor. (`shots/F4-11-submissions-list.png`)
PASS — Manager `/manager/turnaround` counts the item (OPEN REVIEWS 6).
FAIL — The manager cannot reassign it.

```
FAIL — /manager/turnaround offers "Reassign" only for overdue items; a current item cannot be reassigned.
  Where:    /manager/turnaround (and /manager — no reassign there either)
  Role:     MANAGER (manager@aim.edu)
  Steps:    With the QA submission SUBMITTED (not overdue), open /manager/turnaround.
  Expected: The manager (review.reassign) can reassign any open review.
  Actual:   Only Mei Sandoval's overdue item has a Reassign form; the QA item appears only in counts.
  Severity: major (unsure — may be a deliberate "reassign only when late" policy)
  Shots:    shots/F4-25-turnaround.png
```

PASS — The manager has no approve control. A forced `POST /api/submissions/:id/approve` gives 403 "MANAGER does not hold review.approve", and it is audited as DENIED (#563).
PASS — The instructor approves (score 85); the student sees APPROVED with the history of both decisions and their own V2 text. (`shots/F4-27…28`)
PASS — The certification gate requirement "Practical Dx/Rx assessment" flips to ✓ 1 OF 1 CLEARED on AIM-CA. (`shots/F4-29-cert-after-approval.png`)
FAIL — The AIM-CA gate claims the AIM-CP prerequisite is met.

```
FAIL — AIM-CA certification gate shows "✓ AIM-CP™" for a candidate with no AIM-CP credential.
  Where:    /student/academy/AIM-CA, CERTIFICATION GATE
  Role:     STUDENT (qa-flow-cand2), at that point 1 of 5 AIM-CP requirements met and no credential
  Steps:    Enrol on AIM-CA; open the CA track.
  Expected: The step reflects the real record (unmet).
  Actual:   ✓ AIM-CP™.
  Severity: major
  Shots:    shots/F4-29-cert-after-approval.png
```

FAIL — Audit events for decisions do not carry the rationale.

```
FAIL — review.return / review.approve audit events record actor and subject but not the rationale.
  Where:    /admin/audit, events #554–#565
  Role:     ADMIN
  Steps:    Filter "review." after the return and approve.
  Expected: Actor, subject and rationale on each transition (brief F4.7). User-admin events do
            carry "reason" in metadata, so the pattern exists.
  Actual:   Metadata is {path, method, required} only; the rationale lives only on the submission.
  Severity: minor
  Shots:    shots/F4-30-audit-review.png
```

PASS — Every transition is in the audit log with actor and subject: `submission.create` ×4, `review.claim`, `review.return` (plus DENIED/FAILURE for refused attempts), `submission.resubmit`, `review.approve`, and the manager's DENIED approve.

### F5 · Certification → credential → public verification → revocation

Note: no credential existed anywhere (register "ISSUED IN TOTAL 0"). `cand2` completed AIM-CP's lessons and module quizzes and passed the final exam (90%), which issued `AIM-2026-AA2E4A88`. That is a QA-FLOW credential, so every admin action in this flow ran on it.

PASS — `/student/certification` gate states match the record at each point (1/5 → 3/5; lessons 10/10, simulator 1/1, practical 0/1, check ride 0/1). (`shots/F3-09`, `shots/F5-05`)
FAIL — The credential was issued with requirements unmet.

```
FAIL — A credential is issued while the certification center says 3/5 requirements and "Outstanding work remains".
  Where:    /student/certification, /student/credentials/d36d2095-…, /admin/credentials
  Role:     STUDENT (qa-flow-cand2)
  Steps:    Complete the 10 lessons and 10 module quizzes, pass CP-EXAM (90%). Practical (70%, not
            passed) and check ride (not attempted) remain unmet.
  Expected: "The credential is issued once the requirements above are met" (certification page);
            or, if issuance is by final exam alone as /admin/credentials says, the gate and the
            certificate text must not claim otherwise.
  Actual:   Certificate "has successfully completed the requirements for AIM™ Certified
            Practitioner", STANDING ISSUED, next to "REQUIREMENTS MET 3 / 5 · Outstanding work remains".
  Severity: major
  Shots:    shots/F5-03-exam-result.png, shots/F5-04-certificate.png, shots/F5-05-cert-center-after.png
```

PASS — The certificate shows name, programme, version, serial and issue date; it has no horizontal overflow at 360px (scrollWidth 360). (`shots/F5-06-certificate-360.png`)
FAIL — The verify address on the certificate is plain text, not a link. Severity: cosmetic. (`shots/F5-04-certificate.png`)
PASS — Signed out, `/verify/AIM-2026-AA2E4A88` shows "AUTHENTIC · VALID", holder, programme and version. (`shots/F5-07-verify-valid.png`)
PASS — A made-up serial and a garbage serial show "No certificate with this serial", not a 500. (`shots/F5-08-verify-notfound.png`)
PASS — The manager finds it by serial in `/manager/credentials`: read-only, no suspend/revoke controls ("Read-only. Changing a certificate's standing is an administration act."). A forced suspend gives 403. (`shots/F5-09-manager-credentials.png`)
PASS — Admin suspend: reason required (min 20, client and server); the history records it; public verify shows "AUTHENTIC · SUSPENDED"; the student sees SUSPENDED. (`shots/F5-12…14`)
PASS — Reinstate restores VALID everywhere.
PASS — Revoke (on the QA-FLOW credential): verify shows "AUTHENTIC · REVOKED" with the date; the student's certificate, list and certification center show REVOKED; revoke is terminal (no further standing control). (`shots/F5-15…17`)
FAIL — Suspend and revoke act without any confirmation.

```
FAIL — Credential suspend and revoke (permanent) apply on one click with no confirm; "Apply" is grey at rest.
  Where:    /admin/credentials?serial=…, "Change standing" → Apply
  Role:     ADMIN
  Steps:    Choose Suspend (then Revoke), give a valid reason, click Apply once (dialogs were set
            to "dismiss" to detect a confirm).
  Expected: A confirm naming the credential (serial and holder) before a destructive act,
            especially the terminal revoke; a `danger` button red at rest (ui.tsx rule 2).
  Actual:   No confirm; the action applied immediately. Button class is border-ink-700 with
            hover:border-signal-red only.
  Severity: major
  Shots:    shots/F5-11-change-standing.png, shots/F5-12-suspended.png, shots/F5-15-revoked.png
```

FAIL — Server refusal wording: "This action changes a person standing; state why" (missing possessive). Severity: cosmetic.
PASS — Audit: credential issue, suspend, reinstate and revoke each appear in the credential history with the actor and the stated reason.

### F6 · Governance: Dx → Rx → registry

PASS — Manager runs `/governance/dx` for "QA-FLOW-20260926 diagnostic" across 11 dimensions; the observed total updates live. (`shots/F6-01…02`)
PASS — The browser request body has fields `agentName, agentOwner, agentPurpose, score_0…score_10` only, with **no `aai`**. The same holds for the student's run. The server returned AAI 56.4 / ELEVATED.
PASS — Rx (`/governance/rx/[id]`) ranks concentrations highest first (Action 5, Financial 5, Consequence 4…), and prescriptions P1… follow that order. (`shots/F6-03…04`)
FAIL — The Rx invents a sector context.

```
FAIL — Rx text says "In this healthcare context …" and prescribes clinical controls for an agent with no clinical baseline.
  Where:    /governance/rx/627901b0-…
  Role:     MANAGER
  Steps:    Run Dx with no baseline chosen, name "QA-FLOW-20260926 diagnostic", purpose
            "QA-FLOW-20260926 test of Dx to Rx to registry". Build controls.
  Expected: Sector-specific wording only when a sector was chosen.
  Actual:   Healthcare/clinical wording, probably from a keyword match on "diagnostic".
  Severity: minor (unsure)
  Shots:    shots/F6-04-rx-build.png
```

PASS — Registering agent `QA-FLOW-01` "QA-FLOW-20260926 agent <script>…" works; the name renders as text. (`shots/F6-09-agent-detail.png`)
FAIL — A double-click on Register crashes; a single-click duplicate fails silently.

```
FAIL — Duplicate agent code: double-click shows the generic 500 page; a single click shows nothing at all.
  Where:    /governance/registry, "Register an agent"
  Role:     MANAGER
  Steps:    1. Fill the form, double-click Register → agent created, then 500 "Nothing was changed"
            (web log: "That record already exists"). 2. Re-run: submit the same code once → the
            page re-renders with no message and nothing created.
  Expected: One action; a duplicate code refused with the reason next to the field.
  Actual:   As above.
  Severity: major
  Shots:    shots/F6-06-agent-registered.png, shots/F6-07-agent-dup.png
```

**RETRACTED (test error, see §7)** FAIL — The registry list hides unassessed agents.

```
FAIL — Default registry view (sort by AAI) omits agents with no diagnostic; tile says REGISTERED 4, table lists 3.
  Where:    /governance/registry (default), /admin overview "mean AAI across 4 agents"
  Role:     MANAGER, ADMIN
  Steps:    Register an agent; return to the registry without changing the sort.
  Expected: Every registered agent listed (the copy says a new agent "starts as attention").
  Actual:   The new agent appears only when sorting by name/status/last assessed.
  Severity: major
  Shots:    shots/F6-08-registry-by-name.png
```

FAIL — There is no way to bind a diagnostic to an agent in the UI.

```
FAIL — No control anywhere binds a diagnostic to an agent, so a registry agent's AAI cannot change from the UI.
  Where:    /governance/registry/[id], /governance/dx, /governance/rx/[id]
  Role:     MANAGER (holds diagnostic.bind.agent), ADMIN
  Steps:    Look for a bind action on the agent page (only "Last Command / Update"), on the Dx form
            (no agent picker) and on the Rx page.
  Expected: The flow the registry describes: "AAI changes only when a diagnostic is bound to the agent."
  Actual:   The agent stays "RECORDED AAI — · Not yet diagnosed"; binding is unreachable.
  Severity: major
  Shots:    shots/F6-09-agent-detail.png
```

PASS — Student: no registry links in the nav; `/governance/registry` and `/governance/registry/[id]` redirect to `/student`; `GET /api/registry/agents` gives 403 "STUDENT does not hold agent.read". (`shots/F6-11-student-registry.png`)
PASS — Wording: every AAI mention on Dx, Rx, registry, `/manager`, `/admin` and `/` reads as a comparison index ("not deployment permission"); no safety-verdict wording found.
FAIL — Dx score buttons (1–5) are state toggles without `aria-pressed` (ui.tsx rule 4). Severity: minor.

### F7 · Authoring → publish → learner sees it

PASS — Manager creates track `QA-FLOW` "QA-FLOW-20260926 track" (draft v1). (`shots/F7-02-track-created.png`)
FAIL — Adding a module with its CODE filled in crashes.

```
FAIL — "Add module" with the visible, optional CODE field filled gives a 500; the API rejects "property code should not exist".
  Where:    /authoring/tracks/a458a810-… , "Add a module"
  Role:     MANAGER
  Steps:    Fill CODE "QA-M1", title, summary, position 1; Add module. Re-run: same. Leave CODE
            empty: module created.
  Expected: Either the code is accepted or the field is not offered.
  Actual:   500 "That page could not be loaded … Nothing was changed."
  Severity: major
  Shots:    shots/F7-04-module-added.png, shots/F7-05-module-nocode.png
```

FAIL — The BODY entered in "Add lesson" is discarded. It is stored in `bodyMd` but never shown: the structured editor starts empty and the candidate page renders only structured content. Severity: minor. (`shots/F7-07-lesson-authoring.png`)
PASS — In lesson Link blocks, `javascript:alert(1)` renders as plain text and `http://example.com/qa` as the only anchor, in both the author preview and the candidate page. `<script>` in the section heading and body renders as text. (`shots/F7-08`, `shots/F7-26`)
PASS — The question bank shows ✓ on the correct choice for new questions.
FAIL — The seeded banks show no keys.

```
FAIL — Seeded AIM-CP bank: 0 of 365 questions show which choice is correct, though the page says "The correct choice is marked."
  Where:    /authoring/banks/4b307e4e-… (AIM-CP question bank)
  Role:     MANAGER (holds assessment.answerkey.read)
  Steps:    Open the bank; count ✓ markers (0) against bullets (1,460). A new QA question shows ✓.
  Expected: The key visible to an author, so the seeded content can be checked or edited.
  Actual:   No key shown for any seeded question (marking still works for candidates).
  Severity: major (unsure — the seed may store keys in a form this view does not read)
  Shots:    shots/F2-12-mgr-banks.png
```

PASS — Assessment created, placed under the module, paper of 2 questions saved (confirmed via the builder API).
PASS — `/authoring/assessments/[id]/preview` is read-only ("nothing here can be answered or submitted"); there is no key in the HTML; attempts stay at 0. (`shots/F7-15-preview.png`)
PASS — `/authoring/simulator/[id]` preview says "NOTHING IS RECORDED"; answering a mission shows a debrief; CP-SIM attempts stay at 2 (cand2's). (`shots/F7-18-sim-preview-answer.png`)
FAIL — The preview counter reads "0 / 20 flown · 1 correct". Severity: cosmetic.
PASS — The admin publishes v1: a reason is required (min 10). The version becomes PUBLISHED.
FAIL — Publish has no confirm and gives no message when the reason is empty (native tooltip only), though the page says publishing "cannot be undone by editing". Severity: minor. (`shots/F7-20…21`)
FAIL — A published new track never reaches the student academy.

```
FAIL — A published, ACTIVE, visible new track is not listed on /student/academy.
  Where:    /student/academy; also /authoring/badges programme pickers
  Role:     STUDENT (qa-flow-cand2); MANAGER
  Steps:    Publish QA-FLOW v1 (admin); set status ACTIVE (manager); open /student/academy.
  Expected: The track appears in the academy (GET /api/academy/programmes returns it to the
            student: ACTIVE, visible, PUBLISHED).
  Actual:   Only AIM-CP, AIM-CA and AIM-EL render; the new track is reachable only by typing
            /student/academy/QA-FLOW. The badge "shown on track" and criteria pickers are also
            limited to the three seeded codes.
  Severity: major
  Shots:    shots/F7-22-student-academy-qa.png, shots/F7-25-student-academy-active.png, shots/F7-23-student-qa-track.png
```

FAIL — While its programme status was DRAFT, the new track was already reachable to a student by direct URL. Severity: minor, unsure. (`shots/F7-23-student-qa-track.png`)
PASS — Restriction: adding "Holds an active AIM-CA credential" locks the track page for the student with the stated reason. The label's `<script>` renders as text. (`shots/F7-28…29`)
FAIL — The restriction is bypassed by deep link, for both reading and writing.

```
FAIL — A locked track's lesson is readable by deep link and "Mark complete" records progress.
  Where:    /student/lessons/aaac1dea-… ; GET /api/academy/lessons/:id ; progress write
  Role:     STUDENT (qa-flow-cand2), not enrolled on QA-FLOW and failing its restriction
  Steps:    1. Track page shows "🔒 Prerequisite required … Locked". 2. Open the lesson URL
            directly: full content. 3. Mark complete. 4. Track now shows MODULES COMPLETE 1/1;
            /api/me/record contains the lesson.
  Expected: The gate holds server-side for reading and for progress, as it does for assessments
            (POST attempts → 403 "You are not enrolled on the programme this assessment belongs to").
  Actual:   Lesson GET 200; the progress write is accepted.
  Severity: major
  Shots:    shots/F7-30-student-gated-lesson.png, shots/F7-31-locked-mark-complete.png
```

PASS — Deleting a lesson with progress is refused and the rule is named. The UI offers no Delete on a published version; the API gives 400 "1 learner(s) have progress against this lesson. Hide it instead." (Note: a DELETE was also sent for seeded lesson CP-001 as a comparison. It was refused the same way and nothing changed.)
FAIL — Deleting a held badge shows a crash instead of the rule, with no confirm.

```
FAIL — Deleting a badge a learner holds shows the generic 500 page, with no confirm, instead of the server's reason.
  Where:    /authoring/badges, QA_FLOW_BADGE → Delete
  Role:     MANAGER
  Steps:    Define QA badge (awarded automatically to qa-flow-cand2), click Delete.
  Expected: A confirm naming the badge, then the refusal "1 learner(s) hold this badge. Deactivate
            it instead …" (exactly what the API returns).
  Actual:   No confirm; 500 "Nothing was changed." Delete button is red only on hover.
  Severity: major
  Shots:    shots/F7-34-badge-delete.png
```

FAIL — The badge-definition live preview puts the pasted SVG into the author's own DOM unsanitised (`<script>` and `onload` present in the rendered `<svg>`). Nothing fired, and the saved SVG is sanitised correctly. Severity: minor. (`shots/F7-33-badge-defined.png`)
PASS — Student and instructor on `/authoring`, `/authoring/banks/[id]` and `/authoring/assessments/[id]/preview` are redirected to their portal home; no bank or key content rendered. (`shots/F7-35`)
FAIL — Signed-out access to `/authoring*` and `/command` lands on `/login?expired=1`, which says "Your session ended. Sign in again." to someone who never signed in and drops `?next=` (middleware routes keep it). Severity: minor. (`shots/F7-37-anon-expired.png`)
PASS — QA items archived at the end (see Created data).

### F8 · Administration: user lifecycle

PASS — Admin creates `qa-flow-user1@aim.test` as STUDENT; one POST. (`shots/F8-01-user1-created.png`)
FAIL — The Create button has no pending state and no success message. A double-click (on cand2's creation) sent a second POST, which crashed.

```
FAIL — Create user: no pending state; a second submit (double-click) or any existing email gives the generic 500 page, which falsely says "Nothing was changed".
  Where:    /admin/users, "Create user"
  Role:     ADMIN
  Steps:    1. Double-click Create for a new address → user created, then 500. 2. Re-run: Create
            once with an existing address → 500. Web log: "A user with that email already exists".
  Expected: A disabled/pending button; a duplicate refused inline with the reason; a success message.
  Actual:   As above.
  Severity: major
  Shots:    shots/F1-18-create-cand2.png, shots/F1-19-create-duplicate.png
```

PASS — The new user is held at `/account/security` with an explanation; `/student`, `/student/academy`, lessons, `/governance/dx`, `/performance`, `/instructor` and `/admin` all redirect to `/account/security?forced=1`. (`shots/F8-02-user1-held.png`)
PASS — The hold is server-enforced: `GET /api/me/record` and `/api/academy/programmes` with their token give 403 "Your password must be changed before you can do anything else."
FAIL — A held user can still open `/command` (static content, no data). Severity: minor.
FAIL — After the password is set, "Set my password and continue" stays on `/account/security` ("Password changed.") rather than continuing to the portal. Severity: minor. (`shots/F8-00b-cand2-released.png`)
PASS — Role change with a 9-character reason is refused (client and server: "reason must be longer than or equal to 10 characters"). (`shots/F8-03-role-short.png`)
PASS — Role change to INSTRUCTOR with a valid reason takes effect. The user's next request goes to `/login` ("Your session ended. Sign in again."); after signing in again they land on `/instructor` with instructor nav. (`shots/F8-05…06`)
FAIL — The role change ended the user's sessions, but the message doesn't say why (a role change) and there was no confirm before the change. Severity: minor.
PASS — 5 wrong passwords, then the correct one, give the same "Those credentials were not accepted." as an unknown address; the word "locked" never appears. API: 401 "Invalid credentials" for both. (`shots/F8-07`)
PASS — Admin sees "Locked by repeated failed sign-ins." on `/admin/users/[id]`. "Lift the lock" requires a reason and confirms by name ("Lift the lock on QA-FLOW-20260926 User One's account now?"); sign-in then succeeds. (`shots/F8-08…09`)
PASS — Ending one session from the user record (reason ≥ 10) ends only that one. That context's next action goes to `/login` with "Your session ended. Sign in again."; the other session stays live. (`shots/F8-10…11`)
FAIL — The end-session confirm names an IP ("End the session from ::ffff:127.0.0.1?"), not the user, and appears before the reason-length check. Severity: minor.
PASS — "LIVE SESSIONS" tile matches the session list (2 → 1).
FAIL — Suspending and archiving a user have no confirm and no danger styling.

```
FAIL — User suspend and archive act on one click with no confirm naming the user; Archive is red only on hover, Suspend not at all.
  Where:    /admin/users (row actions)
  Role:     ADMIN
  Steps:    Give a valid reason; click Suspend (dialogs set to dismiss). Same for Archive account.
  Expected: A confirm naming the user before each (brief F8.6; UI_TEST_BRIEF §5), danger styling at rest.
  Actual:   Both applied immediately (status SUSPENDED, archivedAt set). 9-character archive
            reasons are refused correctly.
  Severity: major
  Shots:    shots/F8-12-suspended.png, shots/F8-14-archived.png
```

PASS — Suspend and archive each require a reason of at least 10 characters (a 9-character reason is refused).
PASS — A suspended account is indistinguishable in the UI ("Those credentials were not accepted." for right, wrong and unknown). (`shots/F8-13`)
FAIL — The API distinguishes a suspended account when the correct password is supplied (401 "Account suspended" vs "Invalid credentials"). This requires the password, so it is low risk. Severity: minor.
PASS — `/admin/audit` shows `user.suspend`, `user.archive`, `user.password.reset`, `user.session.revoke` and `user.lockout.clear`, each with actor, subject and the stated reason. (`shots/F8-15-audit-user.png`)
PASS — Audit integrity check: `/admin` shows "CHAIN INTEGRITY · Intact · 709 events verified"; `GET /api/audit/integrity` → `{"ok":true,"checked":705}`. (`shots/F8-17-admin-overview.png`)
PASS — `/admin/users` role counts and ARCHIVED 1 match the filtered list (11 active + 1 archived = 12). (`shots/F8-18`)
PASS — Overview tiles for Rx (1 written, 4 without), Academy (6 candidates, 6 active enrolments) and Certification (0 live, 1 revoked) match the pages behind them.
FAIL — Two overview figures are worded misleadingly. "Mean AAI across 4 agents" is averaged over the 3 assessed agents. The certification panel says "ISSUED 0" while the register says "ISSUED IN TOTAL 1". Severity: minor.
FAIL — Student home counts a revoked credential as "CREDENTIALS 1" with no qualifier. Severity: minor (unsure).

### F9 · Password reset

PASS — `/login/forgot` for `qa-flow-user1@aim.test` and for an unknown address: byte-identical screens and identical API responses (202, same message); timing ≈ 1.1 s for both. (`shots/F9-01-forgot-*.png`)
BLOCKED — The self-service link cannot be obtained (mail off; the production API never logs it). Steps 2–3 used the **admin-issued one-time link** from `/admin/users/[id]` instead, which uses the same `/login/reset` path.
PASS — Two links issued; the first then says "That reset link is not valid any more. Ask for a new one." with an "Ask for a new link" option. (`shots/F9-05`)
PASS — The second link sets the password, and the screen states every session has ended. The user's other live context goes to `/login?expired=1`. (`shots/F9-06`)
PASS — Old password refused (401), new password accepted.
PASS — Reusing the spent link: "not valid any more" plus a way to get a new one. (`shots/F9-07`)
PASS — `/login/reset` with no token: "This link is missing its token" plus "Ask for a new link". (`shots/F9-08`)
PASS — A double-click on "Set my password" produced one reset (the second submit was refused as spent).
PASS — Admin link issue requires a reason and is audited (`user.password.reset` with reason).

Note — the admin-issued link uses host `http://52.206.56.240` (`WEB_BASE_URL`), not the host the admin is browsing on. Probably environment configuration, not filed.

### F10 · Role preview (admin@aim.edu)

PASS — Student preview: the banner names "the Student portal" and "You are still Rowan Adeyemi"; the header identity stays "Rowan Adeyemi · ADMIN · VIEWING STUDENT"; the nav becomes the student's. (`shots/F10-01`)
PASS — The answer key is absent from the student-preview assessment HTML.
FAIL — Preview write refusals show the generic crash instead of the preview reason.

```
FAIL — In student preview, "Mark complete" shows the generic 500 page instead of naming the preview; the assessment page itself 500s.
  Where:    /student/lessons/[id] (Mark complete); /student/assessments/[id] (GET)
  Role:     ADMIN previewing STUDENT
  Steps:    Start the student preview; open CP-001 lesson; click Mark complete. Open CP-001-ASSESS.
  Expected: The write is refused with the preview named as the reason; the page renders read-only.
  Actual:   500 "Nothing was changed." for both. The API's messages were right: "You are
            previewing the STUDENT portal, which is read-only. Leave the preview to act." and
            "A preview of the STUDENT portal does not hold assessment.take".
  Severity: major
  Shots:    shots/F10-03-preview-mark-complete.png, shots/F10-04-preview-begin.png
```

PASS — "Leave preview" restores the admin nav, and the `aim_preview` cookie is cleared.
PASS — Instructor preview banner and header are correct.
FAIL — Preview banner grammar: "hold a Instructor's read permissions", "a Instructor sees". Severity: cosmetic.
FAIL — In instructor preview, the main path cannot reach a write: the queue is empty (it narrows to the admin), and a direct `/instructor/review/[id]` returns 500 (same defect as F4). The server-side refusal was confirmed: `POST …/claim` → 403 "You are previewing the INSTRUCTOR portal, which is read-only." Severity: major (500 on an [id] route). (`shots/F10-06`)
PASS — Manager preview: the credentials register is read-only by serial (REVOKED, no controls). (`shots/F10-07`)
FAIL — Two manager pages crash in preview.

```
FAIL — In manager preview, /manager/cohorts and /manager/turnaround return 500.
  Where:    /manager/cohorts, /manager/turnaround
  Role:     ADMIN previewing MANAGER
  Steps:    Start manager preview; open either page.
  Expected: The page renders read-only.
  Actual:   500. Web log: "A preview of the MANAGER portal does not hold instructor.assign".
  Severity: major
  Shots:    shots/F10-09-preview-cohorts.png
```

PASS — In manager preview, cohort detail hides every write control (no reassign/enrol/withdraw forms), so no write is reachable. Inconsistent with the student preview, which offers "Mark complete" and then fails.
PASS — `/account/security` in preview offers no password change: "Not while a role preview is on — leave the preview first." (`shots/F10-12`)
FAIL — Previewing your own role is refused (API 400), but the message reads "You are already a ADMIN". Severity: cosmetic.

### F11 · Performance notes

PASS — The instructor sees their assigned learners on `/performance`; `/performance/write/[cand2]` offers five 1–5 dimensions and three written sections; the index is computed (64/100). (`shots/F11-01…02`)
PASS — Save draft (double-click) creates one draft at `/performance/[id]`; `<script>` in Strengths renders as text. (`shots/F11-03`)
PASS — Release makes it visible to the learner: `/performance` "ABOUT YOU 1 · 1 not yet acknowledged", with the full review and an "I have read this" acknowledge. (`shots/F11-05…06`)
FAIL — Before release, the learner's deep link to the draft `/performance/[id]` returns **500** instead of 404 (same defect family as F4). Severity: major.
PASS — Unassigned instructor (`qa-flow-instr2`) → `cand2`, and assigned instructor → Fatima Al-Rashid (unassigned): the write page shows "Not someone you assess". A nil UUID and a garbage id show the identical page, so there is no existence oracle. (`shots/F11-07-*`)
PASS — Server-side: `PUT /api/performance` for an unassigned subject gives 404 "User not found".
PASS — No console errors in the flow apart from the 500 above.

---

## 3 · Across every flow (§2)

PASS — Back/refresh/deep link: an old attempt URL (`?attempt=<spent id>`) shows the summary, not a resubmittable paper; reloading after a simulator run, submission or decision shows the persisted state.
FAIL — Double-click: most submits are guarded server-side (resubmit, claim, return, reset, simulator begin, performance draft, assessment submit), but **practical submission, user creation and agent registration** duplicate or crash (filed under F4, F8, F6). The Mark complete button sends two POSTs (harmless: idempotent). Severity: major.
PASS — Sign out mid-flow, then Back twice: `/login?next=…`, with no cached live data. (`shots/X-01-back-after-signout.png`)
PASS — No uncaught page errors and no React hydration warnings were recorded in any step. The only console errors are the resource/RSC errors that accompany each 500 listed above.
PASS — Every error or not-found page seen was human: no raw JSON, stack traces or enum values on screen.
FAIL — API refusals are turned into the generic error page (systemic).

```
FAIL — API refusals inside server actions surface as the generic error page, which discards the reason and can falsely say "Nothing was changed".
  Where:    /admin/users (create), /governance/registry (register), /authoring/badges (delete),
            /authoring/tracks/[id] (add module), /student/lessons/[id] in preview, and others above
  Role:     all
  Steps:    Any write the API refuses with a 4xx (duplicate, rule refusal, preview refusal).
  Expected: The page stays, and shows the API's message next to the control — the API messages
            are already specific and humane.
  Actual:   "SOMETHING WENT WRONG · That page could not be loaded · The request did not complete.
            Nothing was changed." After a double-click the first request did change something.
  Severity: major
```

FAIL — Archived learner's pending work stays in an examiner's queue: after `qa-flow-cand2` was archived, its three SUBMITTED duplicates still show in Tomas Lindqvist's `/instructor` queue. Severity: minor (unsure whether deliberate).

---

## 4 · Blocked

| What | Why | To unblock |
| --- | --- | --- |
| F1.3 verification link: sign-in on verify, spent-link message, landing | Mail sending is OFF; the API is a production build (`NODE_ENV=production`), which by design never logs the link | Any of: a mail catcher (e.g. a local SMTP sink) configured by you; a non-production API log; or an admin "confirm address" action (which is also a finding) |
| F1.4 candidate's own-record check and auto-enrol into the intake cohort | Same: `qa-flow-cand1` can never sign in. Intake cohort is "None", so auto-enrol would not place them anyway | As above, plus choosing an intake cohort on `/admin/mail` (not changed, per instructions) |
| F2 repeat as `qa-flow-cand1` | Same | As above |
| F9 self-service link from `/login/forgot` | Same | As above. The rest of F9 ran on the admin-issued link |
| Seeded `instructor2@`, `student2@`, `student3@` | All refused: "Confirm your email address before signing in" (403) | Confirm those addresses (seed fix or admin action). Substituted `qa-flow-instr2@aim.test` for the instructor2 checks |
| Suspend/reinstate on a *seeded* credential | No seeded credential exists (register was empty) | Not needed: done on the QA-FLOW credential, which was then revoked |

A direct read-only DB query to look up seeded answer keys was declined by the tool permission layer. The answer-key checks used the app's own authoring screens and post-submission results instead.

---

## 5 · Created data (final state)

Everything below was created by this run. Archiving is used where the product offers it; where it doesn't, the row remains as noted.

| Record | Id / key | Final state |
| --- | --- | --- |
| User `qa-flow-cand1@aim.test` (self-registered STUDENT, unverified) | c0b4f166-dded-4852-9479-214d11e81551 | **Archived** |
| User `qa-flow-cand2@aim.test` (STUDENT, admin-created) | 8c42f565-0a8b-499b-9bb3-d0bc33737f19 | **Archived**. Enrolments on AIM-CP-2026A and AIM-CA-2026A with examiner Tomas Lindqvist remain (not withdrawn) |
| User `qa-flow-instr2@aim.test` (INSTRUCTOR) | — | **Archived** |
| User `qa-flow-user1@aim.test` (STUDENT → INSTRUCTOR) | 44f8e99f-8440-4ac9-a01f-09299829a0c0 | Suspended, then **archived** |
| Progress / attempts for cand2 | AIM-CP 10 lessons, 10 module quizzes (CP-001 5/5 attempts), CP-EXAM 1, CP-PRACTICAL 1, CP-SIM 2 runs; QA-FLOW lesson | Kept (no archive exists) |
| Submissions (CA-PRACTICAL) | 52df2b6d (V2, **approved**); 83a1053a, a31ab0ee, ca9b7cd6 (**SUBMITTED**, the double-click duplicates) | The three duplicates are **still in Tomas Lindqvist's review queue**; someone needs to decide who clears them |
| Credential | AIM-2026-AA2E4A88 (d36d2095-b49c-464c-a93b-441766029181) | **Revoked** (terminal) |
| Badges awarded to cand2 | 100-Mission Commander, Command Fundamentals, QA_FLOW_BADGE | Kept |
| Badge definition `QA_FLOW_BADGE` | d188fc71-0bb2-4db2-843a-cb475349b343 | **Deactivated** (delete refused: held) |
| Diagnostics | 627901b0-… (manager, practice, with a prescription); 85fc3c6a-… (cand2, practice) | Kept (no archive exists) |
| Registry agent `QA-FLOW-01` | 4b535ded-d86a-4f0f-9a8f-dcedae7130aa | **Retired** |
| Track `QA-FLOW` "QA-FLOW-20260926 track" | programme 1a4003c9-…, version a458a810-… (PUBLISHED) | Programme **ARCHIVED** |
| Module, lesson, assessment in that track | lesson aaac1dea-…, assessment f642445b-… | Kept inside the archived track |
| Question bank "QA-FLOW-20260926 bank" (3 questions) | b281b899-9fb6-4f10-a3ed-2e98a0cea850 | Kept (only Delete is offered) |
| Unlock rule on QA-FLOW (holds AIM-CA credential) | — | Kept on the archived track |
| Performance review of cand2 by Tomas Lindqvist | b74abf2e-aa66-44f7-9e81-57c2fb58f448 | Released |
| Audit events #503 onward, sessions | — | Append-only / expire naturally |

No settings, mail configuration, seeded user, seeded credential, seeded lesson or seeded badge was changed. The seeded examiner `instructor@aim.edu` took review actions only on QA items; the manager made examiner assignments only for QA users.

---

## 6 · Totals

Counted from the PASS / FAIL / BLOCKED lines in sections 2–3.

| | Count |
| --- | --- |
| Checks run | 162 |
| Passed | 100 |
| Failed | 57 |
| Blocked | 5 |

Failed by severity:

| Severity | Count |
| --- | --- |
| critical | 1 |
| major | 26 |
| minor | 24 |
| cosmetic | 6 |

Re-run policy: each FAIL was reproduced a second time before filing where the step is repeatable (register oracle, create-user crash, practical double-submit, review-route 500, add-module crash, agent duplicate). Single-shot destructive steps (revoke, archive) are backed by API confirmation instead of a second destructive run.

---

## 7 · Fixes applied (2026-09-26, after the run)

Everything below was changed in source only. **Nothing has been rebuilt or restarted**, so the running
pm2 servers still serve the code that was tested above. To take effect this needs
`npm run build` (contracts, then API, then web) and a pm2 restart, which were not done because the
brief forbids them without asking. No migration is needed; the database schema is unchanged.

Verification done: typecheck of API, web and contracts (clean), and every unit suite
(API 13 suites / 450 tests, contracts 10 suites / 235 tests, all passing). Two tests were added:
`apps/api/test/answer-key.spec.ts` (new) and a case in `packages/contracts/test/rx.spec.ts`. The flows have **not** been re-run in a
browser against the fixed code; that needs the rebuild first.

Source snapshot taken before any fix:
`/tmp/claude-1000/-opt-aim/c4e0ecc0-ab7c-45cf-a62a-db388ebf42eb/scratchpad/src-before-fixes.tgz`.

### Retracted findings (my test was wrong)

- **F6 "registry list hides unassessed agents"** — the API sorts undiagnosed agents last and the page
  renders every row. My check truncated the page text at 700 characters, which cut the last row off.
- **F2 "`LEVEL1_HALFWAY` never awarded"** — it was awarded to `qa-flow-cand2` at 07:42:13 (confirmed via
  `GET /api/badges/learner/:id`). The certification page only lists badges tied to that track, and
  this badge has no track, so it never appeared there.

### Fixed

| # | Finding | Fix |
| --- | --- | --- |
| 1 | **Critical — `/register` account oracle** | A taken address now gets exactly the response a new one does. Nothing is created; the attempt is audited as `auth.register DENIED {reason: address-taken}`; the owner is mailed instead (a fresh confirmation link if unconfirmed, a new "you already have an account" message if confirmed). Success wording made true for both cases. `auth.service.ts`, `mail/templates.ts`, `contracts/mail.ts` (`ACCOUNT_EXISTS`), `register-form.tsx` |
| 2 | Unverified accounts can't be unblocked; seeded `student2`/`student3`/`instructor2` stuck | New `POST /api/users/:id/verify-email` (`user.update`, reason ≥ 10, audited as `user.email.confirm`). It does what a clicked link does (voids open links, marks confirmed, runs the same onboarding) without starting a session. `/admin/users/[id]` now shows "Email confirmed / not confirmed" and a **Confirm address** control with a confirm step. The seeded accounts can be unblocked through this once deployed. |
| 3 | API refusals shown as the generic crash page ("Nothing was changed") | New `lib/act.ts`. Every server-action write (89 of them) now returns to the page it came from with the API's own message (`?refused=`), shown by one `ActionFlash` banner in the root layout (`role="alert"`). `done()` gives success notices (`?done=`, `role="status"`). |
| 4 | Destructive actions without confirm; danger red only on hover | `ConfirmButton` (red at rest, names the target) on: credential suspend/revoke, user suspend/archive/role change, badge delete, agent retire/delete, publish version. `ConfirmButton` now runs the form's validation *before* asking, and disables itself while submitting. |
| 5 | Double-submit: practical ×2, create user, register agent | New `SubmitButton` (disabled while pending) on those forms and on begin/submit/mark-complete. Server-side, practical submission is refused while one is open for that paper, and check-and-insert run in one serialisable transaction (a lost race → 409 "submitted a moment ago"). |
| 6 | Written-practical attempt limit not counted | Each new submission counts against `maxAttempts` (revisions don't); the page counts submissions for written papers and explains when work is with the examiner or waiting for revision. |
| 7 | `[id]` routes return 500 for out-of-scope, missing or garbage ids (review, performance draft, preview) | New `apiOrNotFound` on the primary record of 20 `[id]` pages. A 404/400 from the API renders a new, uniform `app/not-found.tsx`, which gives no clue whether the record exists. |
| 8 | Role preview 500s (student assessment page, `/manager/cohorts`, `/manager/turnaround`) | The reads a preview can't make (`/assessments/mine`, `/users/instructors`) now use `apiOrNull`; the pages render read-only, and write refusals now show the API's preview reason via #3. |
| 9 | "Add module" crashes when CODE is filled | `CreateModuleDto` accepts the optional `code` (the column already existed); the service stores it. |
| 10 | Locked track: lesson readable and completable by deep link | `GET /academy/lessons/:id` and `PUT /me/progress` now call `trackAccess.assertTrainingOpen` (authors pass); progress on a hidden lesson is refused too. The lesson page shows the lock reason instead of failing. |
| 11 | Lesson page never shows completion | It reads the learner's record and shows "✓ Completed" in place of the button, with a success notice after marking. |
| 12 | AIM-CA gate shows "✓ AIM-CP™" without a credential | With no unlock rule naming the track, the ladder step is met only by an active credential for the programme's `prerequisiteCode`, never by the absence of a rule. |
| 13 | No UI to bind a diagnostic to an agent | Roles with `diagnostic.bind.agent` get a "Bind to a registered agent (optional)" picker on the Dx form (the API already bound on create via `agentId`). Score buttons now carry `aria-pressed` and names. |
| 14 | Manager can reassign only overdue reviews | `/manager/turnaround` adds an "Other open reviews" panel (the API already returned `open`) with the same reassign control, now labelled. |
| 15 | New published track missing from the student academy | The academy and student home list live tracks from `/academy/programmes` (ACTIVE, visible, published) instead of the fixed three codes; badge-authoring track pickers likewise. |
| 16 | Seeded bank shows no keys | The bank page reads string keys (`"2"`) as well as indexes. |
| 17 | **New, found while fixing #16:** questions added on the bank page could never be marked correct | They were stored with option ids `a`–`d` and a numeric key, which `isCorrect` never matches. The bank page now writes canonical ids (`"0"`…) with a string key, and `createQuestion` normalises any index key to an option id (`normaliseAnswerKey`, unit-tested). Rows already stored in the old shape (my 3 archived QA questions) are not migrated. |
| 18 | Final simulator debrief skipped | When the last answer closes the run, the state returns that decision's debrief (runs closed in the last 15 minutes only), so `?review=1` shows it before "See the result". |
| 19 | Rx says "healthcare context" for a non-clinical agent | The healthcare pattern no longer matches "diagnostic" (`diagnos(?!tic)`); test added. |
| 20 | Review rationale missing from audit | `review.*` audit events now carry `rationale`. |
| 21 | No confirmation after a review decision / create user / role change / suspend / archive / reassign / publish | Success notices via `done()`. |
| 22 | SUBMITTED work can't be reopened by the student | Every row on `/student/submissions` links to its detail. |
| 23 | Held user can open `/command` | `/command` layout applies the password hold. |
| 24 | Signed-out `/authoring*` and `/command` → "Your session ended", no `?next=` | Both are now in the middleware matcher, so they get `/login?next=…` like the portals; layouts still do the real check. |
| 25 | "Set my password and continue" doesn't continue | After a forced change it redirects to the role's portal home. |
| 26 | API says "Account suspended"/"Account archived" given the right password | Both now "Invalid credentials"; the real reason stays in the audit record. |
| 27 | Retake/"Attempt again" offered with 0 attempts; "Module badges"/"Badge earned" disagree with badges page | Link reads "Results" when exhausted; panel reads "No attempts left"; labels are now "Module quizzes passed" / "Quiz passed". |
| 28 | Unsanitised SVG in badge-authoring preview | The preview is sanitised in the browser (no script/foreignObject/handlers/off-document refs) before rendering. |
| 29 | Add-lesson BODY discarded | The editor's first section is seeded from the lesson body, so the first save keeps it. |
| 30 | A DRAFT/ARCHIVED/hidden track reachable by URL | `GET /academy/tracks/:code` returns 404 for candidates unless the programme is ACTIVE and visible. |
| 31 | Wording/cosmetic | Verify links clickable (3 places); "a person's standing"; "an Instructor"/"an Admin" in the preview banner; own-role preview message; "Return for revision"/"Approve"/"Grade" labels with `aria-pressed`; end-session confirm names the user; overview "mean AAI across N assessed of M agents" and certification "Valid"; student home counts only valid credentials; simulator preview "flown" count; missing `<label>`s on the forms touched. |

### Needs your decision (not changed)

1. **Credential issued on the final exam alone** (F5). Two fixes are possible. One is to issue only when every gate requirement is met: `assertCredentialEligible` plus the gate, a behaviour change for live candidates. The other is to keep issuance as is and change the certification page and certificate wording. Which rule is intended?
2. **AIM-CP practical and check ride are auto-marked multiple choice** (F4) while the copy says an examiner reviews them. Either set `requiresReview` on those papers (content/config, done in authoring) or change the copy.
3. **AIM-CA/EL are "open to everyone" but show "Requires AIM-CP™"** (F2). Is the open policy intended? If so, the chip should go.
4. **Archived learners' pending work stays in the examiner queue.** Should archiving a learner withdraw or close their open submissions?
5. **"100-Mission Command Simulator" vs 20 missions per run.** This is content (gate-step label and badge name), editable in authoring.
6. **Role change signs the user out with a generic "Your session ended".** Saying why would need the session-revoke reason carried to the login page. Worth doing?

### Not fixed / left as is

- Seeded accounts `student2@`, `student3@`, `instructor2@` are still unverified in the database; #2 gives the UI to fix them after deploy.
- The 3 duplicate QA submissions in Tomas Lindqvist's queue remain (QA data).

### Changed files

API: `modules/auth/auth.service.ts`, `modules/mail/templates.ts`, `modules/users/{users.service,users.controller,users.dto}.ts`,
`modules/academy/{academy.service,academy.dto}.ts`, `modules/learning/learning.service.ts`,
`modules/submissions/submissions.service.ts`, `modules/simulator/simulator.service.ts`,
`modules/credentials/credentials.dto.ts`, `common/audit/audit.interceptor.ts`; test `test/answer-key.spec.ts` (new).
Contracts: `src/mail.ts`, `src/rx.ts`, `test/rx.spec.ts`.
Web (new): `lib/act.ts`, `components/action-flash.tsx`, `components/submit-button.tsx`, `app/not-found.tsx`.
Web (changed): `middleware.ts`, `lib/api.ts`, `app/layout.tsx`, `components/{confirm-button,credential-register,overview-tiles,preview-banner}.tsx`,
and 47 pages/actions under `app/` (register, account, admin, authoring, governance, instructor, manager, performance, preview, student).

Not mine: `apps/web/src/app/landing.tsx` and `apps/web/src/components/theme-control.tsx` changed at 14:30 (hover styles and
theme-switch sync), just after my snapshot, and were left untouched.

---

## 8 · Changes requested after the report (2026-09-26)

Source only, not yet deployed (waiting for the gradebook work, as agreed).

1. **First-sign-in profile.** Students, instructors and managers are held at `/account/profile` until
   they fill in organisation, job title, country, phone number and address. Administrators are not
   held. The API enforces it, not just the page. `SessionGuard` refuses every route except the
   profile screen's own (`GET/PUT /auth/profile`, `/auth/me`, `/auth/sessions`, `/auth/password`,
   `/auth/logout`) with code `PROFILE_REQUIRED`, and any page that hits it redirects there. An
   account created by an administrator sets its password first, then its profile. Saving a complete
   profile opens the portal ("Profile complete. Welcome in"). The profile can be edited later from
   the account menu (**Profile**), and it appears on `/admin/users/[id]`.
   - Rules are shared by form and API: `packages/contracts/src/profile.ts` (`checkProfile`, tested).
   - **Needs a migration**: `apps/api/prisma/migrations/20260926160000_user_profile` (six nullable
     columns on `users`, additive only).
   - **Existing** students, instructors and managers (including the seeded ones) will also be held
     at their next sign-in, because none has a profile yet.
2. **Command and Dashboard merged for students.** The student nav has a single **Dashboard**
   (`/student`), which now shows the four route cards (Dx, Rx, Academy, Certification) at the top.
   `/command` redirects students there. Other roles keep the Command Dashboard. The cards come from
   one shared component (`components/command-routes.tsx`).
3. **"My work" renamed "Submissions"**, with a hint saying what it holds: written work (practicals
   and capstones) sent to an examiner, with every decision and comment. Quizzes and the simulator
   are marked automatically and are not listed there.
4. **Gauges show their scale.** Every gauge (Rx, overview tiles, performance, landing page) now has
   ticks every tenth, numbers at 0, each band boundary and the maximum, and the reading itself
   marked where the needle points.

### Deploy steps (when the gradebook is ready)

```bash
cd /opt/aim
pg_dump -Fc -d "$DATABASE_URL" -f .db-backups/before-profile-$(date +%Y%m%d-%H%M).dump   # backup first
(cd apps/api && npx prisma migrate deploy && npx prisma generate)                       # 20260926160000_user_profile
npm run build                                                                          # contracts → api → web
pm2 restart aim-api aim-web
```

Then smoke-check: sign-in as a student lands on the profile screen, saving it opens the dashboard,
admin is not held, `/verify/<serial>` still answers signed out.

---

## 9 · Assessment attempts: review, shuffle, back, result, requests (2026-09-26)

Source only, not yet deployed.

1. **Review an attempt.** Every marked attempt on a quiz has a **Review** link
   (`/student/assessments/[id]/attempts/[attemptId]`). It shows every question in the order served,
   the learner's answer, and "✓ Right / ✗ Wrong / Not answered". **The correct answer and the
   explanation are shown only once the learner has passed that paper.** Before then, the key would
   be a crib for the next attempt. API: `GET /api/assessments/attempts/:id/review` (own, submitted
   attempts only; 404 for anyone else's).
2. **Shuffled every attempt.** Question order is shuffled when each attempt starts (previously only
   drawn papers were; whole-pool papers such as the module quizzes kept one order). Answer options
   are shuffled per attempt with a seed of attempt and question, so a reload and the review show
   the same order. Marking is by option id, unaffected. Written papers keep their section order.
3. **Back button** at the top of every assessment page ("← Back to AIM-CP") and on the review page.
4. **Result made explicit.** "Not yet" is replaced by one of four states:
   - Passed;
   - In progress;
   - Not passed yet ("50% so far — 80% needed. 2 attempts left.");
   - Not passed ("No attempts left").

   Tiles show the pass mark beside the best score. An open attempt now reads "In progress" with a
   **Continue** link, not "awaiting review".
5. **Request another attempt.** Once every attempt is used without a pass, the page offers a
   request form (reason ≥ 20 characters). The request goes to:
   - the learner's assigned examiner(s), shown in `/instructor`;
   - managers, in `/manager/turnaround`;
   - admins, on `/admin`.

   It is announced to each of them through the notifications feature. They grant 1–3 extra
   attempts or decline, with a note (≥ 10 characters) that the learner sees and that is audited.
   A grant raises only that learner's allowance on that paper. The quiz, the simulator and the
   written submission all read the same allowance. One pending request at a time.
   - New permission `assessment.attempt.grant`: INSTRUCTOR (own learners only), MANAGER, ADMIN;
     prohibited to STUDENT in `invariants.ts`.
   - **Needs a migration**: `20260926180000_attempt_requests` (one enum, one table; additive).

Tests added: `seededShuffle` (contracts), attempt allowance (API).

### Deploy steps (all pending work)

Three migrations are waiting, one of them from the other session:
`20260926160000_user_profile`, `20260926170000_messaging_notifications_self_enrol` (not mine) and
`20260926180000_attempt_requests`. `prisma migrate deploy` applies them in that order.

```bash
cd /opt/aim
pg_dump -Fc -d "$DATABASE_URL" -f .db-backups/before-deploy-$(date +%Y%m%d-%H%M).dump
(cd apps/api && npx prisma migrate deploy && npx prisma generate)
npm run build
pm2 restart aim-api aim-web
```
