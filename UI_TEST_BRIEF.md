# AIM Command Center — UI test brief

You are testing the whole interface: **55 pages, 4 roles, one shared shell**.
Work through every sweep below. Report what you find in the format at the end.

Assume nothing about this application is correct because it compiles. The last
three defects found here were all invisible to a clean typecheck and a green
test suite: an error code dropped between `throw` and the HTTP response, a
column rendered on screen that nothing ever wrote, and a hardcoded figure in a
test that had been true on exactly one day. **Open the pages. Click the
things.**

---

## 0 · Running it

```bash
# from AIM_Command_Center/
npm run db:up          # postgres, if not already running
npm run dev            # contracts watch + api :4000 + web :3000
```

Web is <http://localhost:3000>, API is <http://localhost:4000/api>.

**Servers may already be running and may not be yours.** Other sessions have
worked in this repo. Check before you start:

```bash
curl -s -o /dev/null -w "api:%{http_code}\n" http://localhost:4000/api/health
curl -s -o /dev/null -w "web:%{http_code}\n" http://localhost:3000/login
```

If both answer 200, use them. **Do not restart or rebuild without asking** —
someone may be running suites against them. If you need a rebuild to pick up a
change, say so and wait.

### Accounts

All seeded accounts share the password **`AimAcademy!2026`**.

| Account                                                   | Role       |
| --------------------------------------------------------- | ---------- |
| `student@aim.edu`, `student2@aim.edu`, `student3@aim.edu` | STUDENT    |
| `instructor@aim.edu`, `instructor2@aim.edu`               | INSTRUCTOR |
| `manager@aim.edu`                                         | MANAGER    |
| `admin@aim.edu`                                           | ADMIN      |

Three students and two instructors exist on purpose: assignment and scoping
bugs only show up when there is more than one of something. Use `student2` and
`instructor2` to check that one person cannot see another's work.

---

## 1 · Read this before filing anything

**The middleware is a signpost. The API is the boundary.** Two cookies,
`aim_role` and `aim_preview`, are readable and editable by the browser. They
decide _which page renders_. They decide **nothing** about what data comes
back — the API re-derives the role from the session row on every request.

This distinction determines whether a finding is noise or critical:

- Forging `aim_role=ADMIN` as a student and seeing the admin **navigation** or
  an admin **page shell** → **not a bug.** Expected. Do not file it.
- Forging `aim_role=ADMIN` and seeing admin **data**, a populated table, a real
  user list, an audit entry, an answer key → **critical.** File immediately
  with the exact steps.

Test it like this:

```bash
# sign in as a student, then forge the role cookie
TOKEN=$(curl -s -X POST http://localhost:4000/api/auth/login \
  -H "content-type: application/json" \
  -d '{"email":"student@aim.edu","password":"AimAcademy!2026"}' \
  | python -c "import sys,json;print(json.load(sys.stdin)['token'])")

curl -s http://localhost:3000/admin/users \
  -H "Cookie: aim_session=$TOKEN; aim_role=ADMIN" | grep -i "instructor@aim.edu"
# any real user data in that output is a critical finding
```

**The permission matrix is the source of truth**, not your expectations.
Before calling any access wrong, check it against:

- `packages/contracts/src/permissions.ts` — the complete vocabulary
- `packages/contracts/src/roles.ts` — what each role holds
- `packages/contracts/src/invariants.ts` — what each role must **never** hold
- `packages/contracts/src/preview.ts` — what a preview may borrow

If the interface contradicts those files, that is the finding. Quote the file.

---

## 2 · Sweep A — every route, every role

The core grid: **55 pages × 5 states** (logged out, student, instructor,
manager, admin). For each cell, one of three outcomes is correct — the page
renders, or it redirects somewhere sensible, or it shows an honest refusal.
**A 500, a blank page, an unhandled error, or a raw JSON dump is a finding.**

### Public

`/` · `/login` · `/login/forgot` · `/login/reset`

### Every signed-in role

`/command` · `/account` · `/account/security` · `/performance` ·
`/performance/[id]` · `/performance/write/[subjectId]` · `/governance/dx` ·
`/governance/rx` · `/governance/rx/[diagnosticId]`

### Student portal — STUDENT only

`/student` · `/student/academy` · `/student/academy/[code]` ·
`/student/assessments` · `/student/assessments/[id]` · `/student/badges` ·
`/student/certification` · `/student/credentials` ·
`/student/credentials/[id]` · `/student/lessons` · `/student/lessons/[id]` ·
`/student/simulator` · `/student/simulator/[id]` · `/student/submissions` ·
`/student/submissions/[id]`

### Instructor portal — INSTRUCTOR only

`/instructor` · `/instructor/learners` · `/instructor/learners/[id]` ·
`/instructor/review/[id]`

### Manager portal — MANAGER only

`/manager` · `/manager/cohorts` · `/manager/cohorts/[id]` ·
`/manager/learners` · `/manager/programmes` · `/manager/turnaround`

### Admin portal — ADMIN only

`/admin` · `/admin/audit` · `/admin/credentials` · `/admin/settings` ·
`/admin/users` · `/admin/users/[id]`

### Authoring — gated on a permission, not a role

`/authoring` · `/authoring/badges` · `/authoring/banks` ·
`/authoring/banks/[id]` · `/authoring/assessments/[id]` ·
`/authoring/certificates` · `/authoring/lessons/[id]` ·
`/authoring/restrictions/[programmeId]` · `/authoring/tracks/[versionId]`

Reached by **manager and administrator both**, because the gate is
`programme.update` rather than a portal prefix. A student or instructor must
not get in.

### Registry

`/governance/registry` · `/governance/registry/[id]` — a student must not
reach these; `agent.read` is prohibited to STUDENT in `invariants.ts`.

### Specifically worth your attention

`/authoring/*` and `/command/*` are **not in the middleware matcher**
(`apps/web/src/middleware.ts`). They are guarded in their layouts instead.
Check that signed-out access to both still lands on `/login`, and note the
asymmetry: middleware redirects carry `?next=`, the layout path may not.
Decide whether that inconsistency matters and report it either way.

For every `[id]` route also try: a **valid id belonging to someone else**, a
**well-formed id that does not exist**, and **garbage** (`/student/lessons/x`,
`/admin/users/00000000-0000-0000-0000-000000000000`). Out-of-scope subjects
should 404 rather than 403 — this codebase deliberately hides existence rather
than confirming it. A 500 on any of these is a finding.

---

## 3 · Sweep B — navigation

For each role, sign in and click **every link in the navigation**, plus the
name in the top-right, plus every "back to…" link and every card that looks
clickable.

- Every nav item resolves — no 404, no redirect loop, no bounce back to the
  portal home.
- The nav shown matches the role. Compare against `NAV` in
  `apps/web/src/components/shell.tsx`.
- The name in the header goes to `/account/security`.
- "Sign out" ends the session and lands on `/login`. Pressing Back afterwards
  must not show a cached authenticated page with live data.
- Breadcrumbs and "back" links go where they claim.
- Nothing in the nav points at a page the role will be refused from.

---

## 4 · Sweep C — the design system

This repo is named for button uniformity. Take it seriously.

The vocabulary is defined in `apps/web/src/components/ui.tsx`. Variants:
`primary`, `secondary`, `quiet`, `danger`, `toggle`. Sizes: `sm`, `md`, `lg`,
`icon`, `chip`. Check **every screen** against these rules, which the file
states as safety properties rather than aesthetics:

1. **A button must never look like an input.** Every variant carries a filled
   ground; inputs (`FIELD`) use a recessed one. Find any control that performs
   an action but reads as a field.
2. **`danger` is red at rest, not on hover.** A destructive control that only
   turns red once the pointer is on it is the defect this rule exists to
   prevent. Check every delete, remove, revoke, archive, end-session and
   discard control.
3. **At most one `primary` per panel.** Two competing primaries in one panel is
   a finding.
4. **`toggle` carries `aria-pressed`** and must be visually distinguishable
   from a `Badge`, which is flat and not pressable. A state chip and a control
   that flips state must not be indistinguishable.
5. **Icon buttons are real pointer targets** — square, and large enough to hit.
6. Sizes are used consistently: `sm` for row actions in dense lists, `md` for a
   form's own action, `lg` for the single action a panel exists for.

Then the uniformity question the repo is named after: **do the academy and
certification cards all use the same button treatment?** Compare the AIM-CP,
AIM-CA and AIM-EL track cards, the certification gate, and every "start /
continue / resume" control. Any track card whose primary action is styled
differently from its siblings is a finding.

Also check: focus rings visible on every interactive element, disabled states
legible, hover states present, and no control that changes size on hover and
shifts the layout around it.

---

## 5 · Sweep D — forms, validation, destructive actions

For **every form in the application**:

- Submit it empty. Expect a clear message, not a crash and not a silent no-op.
- Submit with whitespace only.
- Submit with the field at its boundary — one character under a minimum, one
  over a maximum.
- Paste 5,000 characters into every free-text field.
- Paste `<script>alert(1)</script>` and `javascript:alert(1)` into every text
  field that is later rendered — lesson content, names, reasons, notes, agent
  descriptions. It must render as text. (Lesson links are already specified to
  render non-`http(s)` as plain text; verify that holds.)
- Double-click submit. One action, not two. Check for a pending state.
- Press Enter in a single-field form.
- Check the success path actually says something happened.

**Many administrator actions require a stated reason of at least 10
characters** — archiving a user, changing a role, suspending, resetting a
password, ending a session. For each: a 9-character reason must be refused, and
the reason must appear on the audit event afterwards (`/admin/audit`).

**Every destructive action must confirm before acting.** Archive, delete,
discard draft, revoke credential, revoke badge, end session, close cohort. The
confirm text must name the thing being destroyed, not just the verb.

Check the refusals are honest: the server refuses to delete a lesson somebody
has progress against, a version somebody has sat, a cohort with active
learners, a badge a learner holds. Trigger each one and confirm the message
explains _which_ rule stopped it rather than a generic failure.

---

## 6 · Sweep E — authentication and sessions

The newest surface and the least exercised. Detail in `GAPS.md` under 1.6.

**Sign in**

- Wrong password, unknown address, and a suspended account must be
  indistinguishable from one another in the interface.
- 5 consecutive failures locks the account for 15 minutes — after which even
  the **correct** password is refused, and the message must **not** say the
  account is locked. (Saying so would confirm the address is real.)
- An administrator can see the lock on `/admin/users/[id]` and lift it early.

**Forgotten password** — `/login/forgot`

- A known address and an unknown one must produce an **identical** screen. Any
  visible difference is an account oracle and a critical finding.
- The link is single-use and expires in 30 minutes. Spend it twice.
- Request two links; the first must stop working.
- **No mail is sent** — there is no mail transport bound. The link is written
  to the API server log in development. That is expected, not a bug.

**Reset** — `/login/reset`

- With no `?token=`, with a garbage token, with an expired one, and with a
  token already spent. All four should explain and offer a way to get a new
  one.
- Spending a link ends **every** session on the account.

**Your own account** — `/account/security`

- Change password: wrong current password, mismatched confirmation, a password
  that breaks the policy (expect **every** broken rule listed at once, not just
  the first), and the policy rules shown _before_ you type.
- "Keep my other sessions signed in" is off by default. Verify both paths.
- The session list marks exactly one session as the current one.
- Ending your current session signs you out and lands on `/login`.
- The list is **capped at 25** with the true total beside it. The seeded admin
  has several hundred live sessions, so this panel is where a cap bug shows.
  "End all others" must act on the **total**, not the 25 shown, and its confirm
  text must say the real number.

**Forced password change**

Create a user as an administrator, then sign in as them. The account is _held_:
every page must send them to `/account/security` with an explanation, and they
must not be able to click into any portal page. Setting a password releases
them. Verify the held state is enforced by the server, not just the interface —
call the API directly with their token.

---

## 7 · Sweep F — role preview (administrator only)

An administrator can view any portal without a password. **It is not
impersonation.** While it is on:

- The banner is visible and names both the previewed role and the real person.
- The navigation becomes the previewed portal's.
- The identity in the header stays the **administrator's own**.
- **Every write is refused.** Try to submit something on each previewed portal
  — a lesson completion as a student, an approval as an instructor, a cohort
  edit as a manager. Each must refuse and explain that the preview is the
  reason.
- The answer key is never visible in a student preview.
- Ending the preview restores the administrator's own nav and permissions.
- Previewing your own role is refused.
- `/account/security` must not offer a password change while previewing — it is
  a write, and the panel should say so rather than fail on submit.

---

## 8 · Sweep G — empty, loading, error

The states nobody builds and everybody hits.

- **Every list with zero rows.** Use `student3@aim.edu` and
  `instructor2@aim.edu`, who have little or no data. An empty table must say
  something, not render headers over nothing.
- **"You cannot see this" vs "there is nothing here"** must read differently.
  The codebase has a `Refused` component for the first; find any place showing
  an empty list where it should be saying refused.
- Slow and failed loads: stop the API (`ask first`) or throttle in devtools,
  then navigate. Confirm `app/error.tsx` shows something human.
- Let a session expire or revoke it from another browser, then act in the first
  one. The failure must be explained, not a crash.
- Long content: a 200-character lesson title, a cohort with 100 learners, an
  agent name with no spaces. Check truncation and overflow, not just wrapping.

---

## 9 · Sweep H — accessibility

- Every input has a real `<label>` tied by `htmlFor`, not a placeholder doing
  the job.
- Keyboard only: Tab through every screen. Nothing unreachable, no trap, focus
  order follows the visual order, focus ring always visible.
- Any `window.confirm` dialogs are reachable and dismissable by keyboard.
- Headings descend in order — one `<h1>`, no skipped levels.
- Errors use `role="alert"`, status messages `role="status"`.
- Colour is never the only signal — pass/fail, met/unmet, live/expired must
  carry text or a glyph as well as a colour.
- Contrast on the dark ground: the muted `text-ink-400` on `panel` is the pair
  most likely to fail. Measure it.
- Icon-only buttons have accessible names.
- Zoom to 200%. Nothing should be cut off or overlap.

---

## 10 · Sweep I — responsive

Check at 360px, 768px, 1024px and 1440px:

- No horizontal scroll at any width.
- The navigation wraps rather than overflowing.
- Tables: decide whether they scroll, stack or truncate — and whether that was
  a decision or an accident.
- The certificate, the Dx gauge, the simulator and any chart hold up at
  360px.
- Touch targets are large enough on the narrow widths.

---

## 11 · Sweep J — do the numbers agree

This system's own doctrine: _a tile that disagrees with the screen behind it is
worse than no tile._ For **every** stat tile, count, badge and progress figure,
open the screen behind it and check the number matches.

Specifically:

- The admin overview tiles (Dx, Rx, Academy, Certification) against each
  domain's own page.
- `/admin/users` role counts and archived count against the filtered list.
- "Live sessions" on a user record against the session list on that record.
- Course progress percentages against the module breakdown beside them.
- Attempts used vs. the limit on an assessment.
- The certification gate's met/unmet steps against the candidate's real record.
- Review turnaround figures against the queue.

A manager should see `null`-backed panels simply not drawn, rather than drawn
as zero. Check that where a role is out of scope, the panel is absent rather
than falsely empty.

---

## 12 · Sweep K — words

- Spelling and grammar on every screen, including button labels, empty states,
  confirm dialogs and error messages.
- Terminology, which this product is strict about: **AAI is a comparison
  index, not a safety verdict or a deployment permission.** Any screen implying
  otherwise is a finding.
- The `™` on AIM™ Dx and AIM™ Rx is used consistently.
- Date and number formatting is consistent across screens.
- No placeholder text, no lorem ipsum, no "TODO", no raw enum values like
  `IN_REVIEW` shown where a human label belongs.

---

## 13 · Known — do not re-report

1. **`MODULES_COMPLETED` unlock rules count against the latest published
   version**, but a cohort stays on the version it enrolled against. The seeded
   cohort is on a retired AIM-CP v1, so a student who finished all ten modules
   counts as 0 and stays locked out of AIM-CA.
   (`track-access.service.ts:361`.) Already with the owner.
2. **Nothing prunes session rows** — gap 1.8. ~966 live rows on the dev
   database. Expected; it is why session lists are capped.
3. **No mail transport.** Self-service reset links go to the server log, not a
   mailbox. Deployment prerequisite, not a defect.

If you find something that _looks_ like one of these but behaves differently,
do report it — say which one it resembles and how it differs.

---

## 14 · How to report

Write findings to `UI_QA_REPORT.md` in this directory, in the house style used
by the other QA files here — one declarative line per check:

```
PASS — Administrator nav resolves; all 13 links reach a rendered page.
FAIL — Archive button on /admin/users renders grey at rest, red only on hover.
```

For every **FAIL**, add a block beneath it:

```
FAIL — <one sentence: what is wrong>
  Where:    /admin/users/[id], "Live sessions" panel
  Role:     ADMIN (admin@aim.edu)
  Steps:    1. ... 2. ... 3. ...
  Expected: <what should happen, and why — cite the file or rule if you can>
  Actual:   <what happened>
  Severity: critical | major | minor | cosmetic
```

**Severity means:**

- **critical** — data leaks across a role boundary, a write succeeds that the
  matrix forbids, an account oracle, or the application is unusable.
- **major** — a feature does not work, or a control lies about what it does.
- **minor** — works, but confusing, inconsistent, or awkward.
- **cosmetic** — spacing, alignment, wording.

End the report with a count: checks run, passed, failed, by severity.

---

## 15 · Rules of engagement

- **Report, do not fix.** Unless you are explicitly asked to fix something,
  your output is the report. A fix mid-sweep invalidates everything you already
  tested.
- **Do not restart or rebuild the servers without asking.**
- **Do not modify seed data destructively.** Create your own test rows, and
  clean them up — archive rather than delete, which is this system's rule
  everywhere.
- **Re-run before believing a red result.** A build taken while someone else is
  editing can report failures that are not real. Confirm twice before filing.
- **Verify against the running application, not by reading the code.** Code
  review is not this job. If you catch yourself writing "this should work based
  on the source", go and open the page instead.
- If a finding depends on a judgement call — a design inconsistency that might
  be deliberate — **file it and say you are unsure**. A flagged question is
  cheaper than a missed defect.
