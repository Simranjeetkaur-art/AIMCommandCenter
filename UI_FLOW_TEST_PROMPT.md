# AIM Command Center — end-to-end UI flow test

You are a QA agent. Your job is to drive the AIM Command Center **through a real
browser, as real users**, and prove that each business flow works from the
first click to the last — across roles, where one person's action has to show
up on someone else's screen.

This complements `UI_TEST_BRIEF.md`, which sweeps pages one at a time. **Read
that brief first**: its §1 (middleware vs API boundary), §13 (known issues),
§14 (report format) and §15 (rules of engagement) all apply here unchanged.
This document adds what page sweeps cannot catch: **the hand-offs between
screens and between roles.**

A flow passes only if every step renders, every action has a visible result,
and the data that step created is visible — correctly — at the next step,
including on another role's screen and in `/admin/audit`.

---

## 0 · Environment

- Web: <http://localhost:3000> · API: <http://localhost:4000/api>
- The servers run under **pm2** (`ecosystem.config.js`: `aim-api`, `aim-web`)
  from production builds. Check they answer before you start:

  ```bash
  curl -s -o /dev/null -w "api:%{http_code}\n" http://localhost:4000/api/health
  curl -s -o /dev/null -w "web:%{http_code}\n" http://localhost:3000/login
  ```

- **Do not restart, rebuild, re-seed or migrate.** Do not run `npm run dev`.
  The database may hold real data (there are backups in `.db-backups/`). If you
  need a server action, stop and ask.
- Seeded accounts (password `AimAcademy!2026`): `student@`, `student2@`,
  `student3@`, `instructor@`, `instructor2@`, `manager@`, `admin@` — all
  `@aim.edu`.
- Source of truth for who may do what: `packages/contracts/src/roles.ts`,
  `permissions.ts`, `invariants.ts`, `preview.ts`.

### Tooling

Use **Playwright (Chromium)** for all flows. Browsers are already cached in
`~/.cache/ms-playwright`. Install the library in your scratch directory, **not
in the repo**:

```bash
cd "$SCRATCH" && npm init -y >/dev/null && npm i -D playwright@latest
```

- One **browser context per role**, so sessions do not bleed. Keep the contexts
  open side by side for cross-role flows.
- Capture a **screenshot at every step** and on every failure; save to
  `$SCRATCH/shots/<flow>-<step>.png`. Also record console errors and any
  network response ≥ 400 per step.
- Use `curl` against the API only to **confirm** what the UI showed (e.g. that
  a refused write really was refused server-side). Never use it to perform a
  step the flow is meant to test through the UI.

### Test data

- Every record you create carries the prefix **`QA-FLOW-<yyyymmdd>`** in its
  name/title, and every user you create uses an address at **`@aim.test`**.
- **Never send mail to a real address.** Before any flow that sends mail
  (registration, password reset), open `/admin/mail` as admin and note the
  configured provider. If a real provider is live, use only `@aim.test`
  addresses and obtain links from the API log (`pm2 logs aim-api --lines 200
  --nostream`). If you cannot get a link without real mail being delivered,
  **stop that flow and ask** — do not change the mail configuration.
- Clean up at the end by **archiving**, never deleting. List everything you
  created in the report.

---

## 1 · Flows

Run these in order — later flows reuse what earlier ones create. For each
step, check: the page rendered, the control you needed was there and enabled,
the action gave clear feedback, and the resulting state is correct.

### F1 · Self-enrolment → verification → first sign-in

1. Admin: `/admin/mail` — record whether self-enrolment is on and which intake
   cohort new candidates land in. Do not change it.
2. Signed out: `/` → find the way to `/register`. Register
   `qa-flow-cand1@aim.test`. Try invalid inputs first (empty, bad email, weak
   password, existing email `student@aim.edu`).
   - Registering an existing address must not reveal that it exists.
3. Obtain the verification link (see Test data). Open `/verify?token=…`.
   - It signs you in and lands on the student home.
   - Re-open the same link: spent tokens are explained, with a resend option.
   - `/verify?token=garbage` explains and offers a resend.
4. Confirm the new candidate sees only their own record, and — if auto-enrol is
   on — is enrolled in the intake cohort. As manager, find them in that
   cohort. As admin, find the registration and verification in `/admin/audit`.

### F2 · Learner journey: academy → lesson → assessment → badge

As `student@aim.edu` (then repeat the key steps as `qa-flow-cand1`):

1. `/student` → `/student/academy` → open track **AIM-CP** → a module → a
   lesson (`/student/lessons/[id]`). Mark it complete.
   - The progress figure on the track card, the module breakdown and
     `/student` home all move by the same amount.
2. Open the module assessment (`/student/assessments/[id]`). Answer, submit.
   - Score and pass/fail are shown; attempts used vs limit updates.
   - The answer key is never in the page source or network responses **before**
     submission (search the HTML and every JSON response for the correct
     answers).
   - Use up the attempts: the next attempt is refused with a clear reason.
3. Check `/student/badges` and `/student/assessments` reflect the result.
4. Locked tracks (AIM-CA, AIM-EL) say what unlocks them. Mind known issue #1 in
   the brief (retired AIM-CP v1 cohort) — report only if behaviour differs.

### F3 · Command simulator

1. Student: `/student/simulator` → start a run → play each mission; the debrief
   appears after each decision.
2. Finish the run: score vs pass mark shown; result persists after reload and
   appears wherever simulator progress is summarised.
3. Abandon a run mid-way (navigate away, come back): resume or restart is
   explicit, not silent loss.

### F4 · Practical submission → review → revise → approve (cross-role)

Contexts open: student, instructor, instructor2, manager.

1. Student submits a practical/capstone (`/student/submissions`). Include
   `<script>alert(1)</script>` in the text — it must render as text everywhere
   below.
2. Instructor (assigned): it appears in `/instructor` queue. `instructor2` (not
   assigned) must **not** see it, and `/instructor/review/[id]` must 404 for
   them.
3. Instructor returns it for revision. A rationale under **40 characters** is
   refused; a valid one is accepted.
4. Student sees it as returned with the rationale, revises and resubmits.
5. Manager: sees the item in `/manager/turnaround`; can **reassign** it; has
   **no way to approve** (no control, and a forced API call is refused).
6. Instructor approves. Student sees the approved state; certification gate
   step for that requirement flips to met.
7. Every transition is in `/admin/audit` with actor, subject and rationale.

### F5 · Certification → credential → public verification → revocation

1. Student: `/student/certification` — each gate step's met/unmet status
   matches the real record (from F2–F4).
2. Where a candidate meets all gates (use seeded data if none of yours does),
   the credential is issued: `/student/credentials/[id]` shows the certificate
   and serial. Check it at 360px as well.
3. **Signed out**, open the verify link printed on the certificate
   (`/verify/[serial]`). Shows "Valid", holder name, programme, version.
   - A made-up serial shows a clear not-found, not a 500.
4. Manager: `/manager/credentials` finds it by serial — **read-only**, no
   suspend/revoke controls.
5. Admin: `/admin/credentials` — **suspend** it (reason required, confirm names
   the credential). Public verify page now shows "Suspended". Reinstate.
   Then do this on a `QA-FLOW` credential only: **revoke** → verify page shows
   "Revoked"; student sees the revoked state.

### F6 · Governance: Dx → Rx → registry

1. Any signed-in role: `/governance/dx` — complete a diagnostic across the 11
   dimensions, titled `QA-FLOW-<date> diagnostic`. AAI is shown, computed by
   the server (the request body must contain no `aai` field).
2. Open its Rx (`/governance/rx/[diagnosticId]`): the envelope and A/G/H/X
   items are ranked by the dimensions that produced the exposure.
3. Manager/admin: `/governance/registry` → create agent `QA-FLOW-<date> agent`
   → **bind** the diagnostic. The agent's AAI moves only after binding.
4. Student: registry links absent; `/governance/registry` and `/[id]` refused
   (`agent.read` is prohibited to STUDENT in `invariants.ts`).
5. Wording: nowhere may AAI read as a safety verdict or deployment permission.

### F7 · Authoring → publish → learner sees it

As manager (then spot-check as admin):

1. `/authoring` → create a lesson `QA-FLOW-<date> lesson` in a test track/
   version; include a `javascript:` link and an `http` link — only the latter
   is clickable when rendered.
2. Create a question bank and an assessment; use
   `/authoring/assessments/[id]/preview` and `/authoring/simulator/[id]` —
   preview records **nothing** (no attempt appears for anyone).
3. Publish (or make visible) and confirm a student sees the new lesson in the
   right place in the academy. Set a restriction in
   `/authoring/restrictions/[programmeId]` and confirm the student is gated.
4. Try to delete a lesson that has progress against it, and a badge a learner
   holds: refusals must name the rule. Archive your QA items at the end.
5. Student and instructor: `/authoring/*` refused; signed out lands on
   `/login` (note whether `?next=` is kept).

### F8 · Administration: user lifecycle

1. Admin: `/admin/users` → create `qa-flow-user1@aim.test` as STUDENT.
2. Sign in as them in a fresh context: held on `/account/security` until the
   password is set; every portal URL redirects there; confirm via API the hold
   is server-enforced.
3. Admin: change their role to INSTRUCTOR (reason < 10 chars refused). Their
   **next request** reflects the new role and nav — no re-login trickery
   needed, or if it is needed, the UI says so.
4. Lockout: 5 wrong passwords → correct password refused, message does **not**
   say "locked". Admin sees the lock on `/admin/users/[id]` and lifts it; sign
   in succeeds.
5. Admin ends one of their sessions from the user record → that context's next
   action is sent to `/login` with an explanation.
6. Suspend, then archive the user. Each needs a reason, a confirm naming the
   user, and appears in `/admin/audit`. Run the audit integrity check — it
   passes.
7. `/admin` overview tiles match the pages behind them after all of the above.

### F9 · Password reset

1. Signed out: `/login/forgot` for `qa-flow-user1@aim.test` (before archiving)
   and for an unknown address — screens identical.
2. Use the link: reset works, all other sessions for that user end, old
   password refused, new one accepted.
3. Re-use the link, request two links and use the first, `/login/reset` with no
   token — each explained with a way to get a new link.

### F10 · Role preview

As admin, preview each portal (student, instructor, manager) and walk the
**main path** of that role's flow above (F2, F4, F5 respectively) up to the
first write. Banner names the previewed role and the real admin; header
identity stays the admin's; **every write is refused with the preview named as
the reason**; answer keys stay hidden; ending preview restores admin nav.

### F11 · Performance notes

As instructor: `/performance/write/[subjectId]` for an assigned learner → save
→ visible on `/performance/[id]` and to the learner if the matrix says so.
For `instructor2` and an unassigned learner (Fatima Al-Rashid): the write page
is refused/404.

---

## 2 · Across every flow

- **Back / Refresh / deep link** at each step: no resubmission, no lost state,
  no stale data after an action.
- **Double-click** every submitting control: exactly one action.
- **Sign out mid-flow**, press Back: no live data from the cache.
- Console clean: any uncaught error or React hydration warning is a finding.
- Every error/404 page is human — no raw JSON, stack traces or enum values.

---

## 3 · Report

Write `UI_FLOW_REPORT.md` in the repo root. Structure:

1. **Summary table** — one row per flow: `PASS` / `FAIL` / `BLOCKED`, steps
   passed/total, worst severity.
2. **Per flow** — one `PASS — …` / `FAIL — …` line per step, using the exact
   finding block and severity scale from `UI_TEST_BRIEF.md` §14, plus the
   screenshot path for each failure.
3. **Blocked** — anything you could not run and why (e.g. mail link
   unobtainable), and what you need to unblock it.
4. **Created data** — every record you created and its final state (archived).
5. **Totals** — checks run, passed, failed by severity.

Re-run a failing step once before filing it. Report, do not fix. If a behaviour
might be deliberate, file it and say you are unsure.
