# AIM Command Center

The AIM™ Command Center as a dynamic application: the v4.3.1 browser prototype’s
functionality — Dx, Rx, the agent registry, three certification tracks and the
administration console — rebuilt on a real stack, so that what a role **cannot**
do is enforced on the server rather than hidden in the interface.

The prototype held ~700 assessment items and every answer key in a single
929 KB `app.js` that the candidate downloaded, and kept all progress in
`localStorage`. Its own README named the gap: _"needs secure identity, server-side
exam logic, a larger protected question bank, practical review, database/audit
history, credential revocation, and a public verification service."_ That is what
this is.

| Layer                | Stack                                | Role in the system                                                                            |
| -------------------- | ------------------------------------ | --------------------------------------------------------------------------------------------- |
| `apps/web`           | Next.js 15, React 19, Tailwind 4     | The interface. Renders on the server, so session credentials never reach the browser.         |
| `apps/api`           | NestJS 11, guards, audit interceptor | The API, and the real security boundary. Every route carries a declared, testable permission. |
| Database             | PostgreSQL 16, Prisma 6, JSONB       | The system of record. Enforces uniqueness, transactions and the append-only audit log.        |
| `packages/contracts` | TypeScript                           | The permission vocabulary and role matrix, shared by both apps and asserted by tests.         |

## Quick start

```bash
cp .env.example apps/api/.env          # edit DATABASE_URL and SESSION_SECRET
cp .env.example apps/web/.env.local    # API_BASE_URL only

npm install
npm run build -w @aim/contracts
npm run db:up        # docker compose up -d db  (skip if you have Postgres already)
npm run db:migrate   # prisma migrate dev
npm run db:harden    # installs the append-only triggers -- see below
npm run db:seed
npm run dev          # api on :4000, web on :3000
```

Sign in at <http://localhost:3000>. Seeded password for every account is
`AimAcademy!2026`.

| Account              | Role          | What to look at                                                                |
| -------------------- | ------------- | ------------------------------------------------------------------------------ |
| `student@aim.edu`    | Student       | Own record only. Returned work can be revised.                                 |
| `instructor@aim.edu` | Instructor    | Two assigned learners. Fatima Al-Rashid is deliberately not one of them.       |
| `manager@aim.edu`    | Manager       | The whole roll, an overdue review to reassign, and no way to approve anything. |
| `admin@aim.edu`      | Administrator | Users, credentials, the audit log and its integrity check.                     |

## What was ported, and where it lives now

| Prototype screen               | Now                         | Enforced by                                                                                 |
| ------------------------------ | --------------------------- | ------------------------------------------------------------------------------------------- |
| AIM Dx (11 dimensions)         | `/governance/dx`            | AAI computed server-side; the DTO has no `aai` field, so no caller can assert an index      |
| AIM Rx (envelope, A/G/H/X)     | `/governance/rx/[id]`       | Derived from the diagnosis, ranked by the dimensions that produced the exposure             |
| AI Agent Registry              | `/governance/registry`      | An agent’s AAI moves only when a diagnostic is _bound_, which needs `diagnostic.bind.agent` |
| Academy (3 tracks, 30 modules) | `/student/academy`          | Lessons and 830 questions in Postgres; keys behind `assessment.answerkey.read`              |
| Module and final assessments   | `/student/assessments/[id]` | Marked by the server; the paper is projected without the key, not stripped of it            |
| Practical, capstone, defence   | Review queue                | Examiner decision needs a 40-character written rationale                                    |
| Certification / credential     | `/student/credentials`      | Requirement gates evaluated server-side; waivers stamped on the certificate                 |
| Administration console         | `/admin`                    | Users, credentials, append-only audit log, settings                                         |

### The content import

`prisma/import-aim.ts` reads the corpus extracted from the prototype and maps it
into Programme → Version → Module → Lesson / Assessment → Question.

The prototype stored questions in ten different literal shapes, and the
single-letter keys do not mean the same thing in all of them: in `{ q, a[], c }`
the choices are `a`, and in `{ q, c[], a }` they are `c`. Guessing by key name
silently dropped 35 items. The normaliser now decides by shape — the choices are
whichever field holds an array, the answer whichever holds an integer that
indexes into it — and `test/import-normalise.spec.ts` pins every bank’s count, so
a syllabus that quietly shrinks fails the build. The seed refuses to run at all
if anything is dropped.

Lesson markup is sanitised on the way in: the prototype’s lessons ended with
their own quiz wired to inline `onclick` handlers and browser state, which is
now a server-marked assessment, so that markup is removed along with every
event handler and script tag.

## Authoring: adding courses, content and badges

`/authoring` is the build surface. It sits outside the role portals because two
roles reach it — the manager who builds the academy and the administrator who
publishes it — and `/manager` is routed by role. The gate is the permission
(`programme.update`), not the role.

| Screen                          | What it does                                                                          |
| ------------------------------- | ------------------------------------------------------------------------------------- |
| `/authoring`                    | Create a course; see every track's level, prerequisite and versions                   |
| `/authoring/tracks/[versionId]` | Add modules, lessons and assessments; publish the version                             |
| `/authoring/lessons/[id]`       | Edit the lesson itself: overview, objectives, numbered sections, key-insight callouts |
| `/authoring/assessments/[id]`   | Author questions, choices, answer keys and explanations                               |
| `/authoring/badges`             | Define badges and the condition that earns each one                                   |

A **draft** version is editable; a **published** one is refused, because live
candidates are being measured against it. To correct a published course, use
**Revise**: it creates a draft cloned from the published version — every module,
lesson and assessment — so fixing a sentence does not mean rebuilding ten
modules. Publishing the draft retires the previous version.

### Lessons are structure, not markup

The prototype's lessons were HTML built inside render functions, so changing a
sentence meant editing JavaScript. `prisma/lesson-parser.ts` reads all thirty of
them back into `LessonContent` — eyebrow, learning path, lead, stat chips,
course overview, learning objectives, numbered sections and their callouts — and
that structure is what the authoring screen edits and the interface renders.

Nothing from the database becomes markup on the page: an author edits text and
the interface decides how text looks, so a lesson cannot carry styling, layout
or script of its own. `test/lesson-parser.spec.ts` asserts that every lesson
survives the trip with its sections, objectives and key insights intact.

## The ladder

Tracks are ordered, and the order is enforced.

|                                | Level | Prerequisite              |
| ------------------------------ | ----- | ------------------------- |
| AIM-CP™ Certified Practitioner | 1     | none                      |
| AIM-CA™ Certified Architect    | 2     | active AIM-CP™ credential |
| AIM-EL™ Enterprise Leader      | 3     | active AIM-CA™ credential |

The lock is not cosmetic. Starting an attempt or creating a submission on a
locked track is refused server-side, so a candidate who guesses the URL gets the
same answer as one who clicks the button.

**Development access** (`tracks.ca.devAccess`, `tracks.el.devAccess`) opens
_training_ without the prerequisite — the prototype's "🧪 DEVELOPMENT ACCESS"
banner. It never opens _issuance_: `assertCredentialEligible` ignores the flag
entirely, because a credential earned behind a development switch would attest
to a prerequisite the holder does not have. Nor can a gate waiver stand in for
it: a waiver explains an unmet requirement of _this_ track, not the absence of
the one below it.

The **certification gate** on each track page is drawn from `AIM_LADDER`, with
every step resolved against the signed-in learner:

```
AIM-CP™ → 10 Architecture Modules → Architecture Exam → Advanced Simulator
        → Design Practical → Architecture Defense → AIM-CA™
```

## Badges

A badge is a condition the server evaluates, not a label somebody applies.

Conditions: passes a named assessment · scores at least N% · completes N modules
of a track · completes a whole track · holds a credential · runs N diagnostics ·
or **manual**, awarded by an examiner with a stated reason.

The evaluator runs at the three moments a condition can newly become true — an
attempt marked, a review recorded, a credential issued — and awards what is
earned. A condition that cannot be answered is refused at definition time: a
score condition needs a threshold, a track condition needs a track. An
unearnable badge is worse than none, because a candidate cannot discover it.

Three roles have a hand in what a candidate earns, and the split follows the
same line as reviews:

|               | Defines the condition | Awards by hand | Withdraws an award |
| ------------- | --------------------- | -------------- | ------------------ |
| Manager       | ✓                     | —              | —                  |
| Instructor    | —                     | ✓              | —                  |
| Administrator | ✓                     | —              | ✓                  |

No role both defines a badge and awards it by hand; one that did could invent a
condition and declare it satisfied in the same breath. That is asserted in
`matrix.spec.ts`, alongside the same rule for authoring and approving an
assessment.

## The four roles

### Student — the candidate

Sees their own record, and nothing that belongs to anyone else.

**Can** take assessments and simulations, submit written work, read lessons and
track their own progress and badges, view their own credentials and download
their certificate, revise and resubmit work an instructor has returned.

**Cannot, enforced server-side:** see any other learner in any way; see an answer
key, ever; alter a score, a badge or a completion record; reach an instructor,
manager or administration screen.

### Instructor — the examiner

Sees only the learners assigned to them, and judges their work.

**Can** see the full record of their assigned learners, claim items from the
review queue, approve written work or return it with required comments, grade
practicals, capstones and defences, add instructor comments to a learner record.

**Cannot, enforced server-side:** see learners who are not assigned to them;
review their own submission; approve without substantive written comments; issue,
suspend or revoke a credential; create users or change anyone's role.

### Manager — the programme manager

Builds and runs the academy, but never judges a candidate.

**Can** create and edit programmes, modules and lessons; author questions and
question banks; create cohorts, enroll and withdraw learners; assign instructors
to learners and cohorts; see all learner progress and run reports; monitor review
turnaround and reassign overdue reviews.

**Cannot, enforced server-side:** grade or approve any candidate's work; issue,
suspend or revoke a credential; publish a programme version; create users or
change roles; change system settings or feature flags.

### Administrator — the institution

Full authority, and every action written to the audit log.

**Can** do everything a manager can, plus publishing programme versions; create
users, assign roles, suspend accounts; issue a credential manually with a
mandatory stated reason; suspend, revoke or reinstate any credential; configure
portal areas, branding, settings and feature flags; read the complete audit log
and export it.

**Cannot, enforced server-side:** edit or delete an audit event — the database
refuses; act without being recorded as the actor; retrieve a password — they are
hashed, not stored; bypass a requirement gate without it being stamped on the
credential.

## How the "cannot" column is actually enforced

The interesting column is the second one. Four mechanisms carry it, and they are
layered so that no single edit removes a guarantee.

**1. One permission vocabulary, in one file.**
`packages/contracts/src/permissions.ts` is the complete list. A capability that
is not there cannot be demanded by a route. Some absences are deliberate:
`audit.update` and `audit.delete` do not exist, so there is no permission that
could authorise the attempt.

**2. Prohibitions as data, asserted by tests.**
`packages/contracts/src/invariants.ts` writes the cannot-do column down as a
list of `{ role, permission, because }`, and `test/matrix.spec.ts` asserts every
entry. Widening the matrix by accident fails the build. Separation of duties is
asserted structurally too: no role may both judge work and control the
credential it leads to, and no role may both author an assessment and sit one.

**3. Fail-closed guards on every route.**
`SessionGuard` resolves an opaque session token to an actor. `PermissionsGuard`
then refuses anything the role does not hold — including a route that declares
nothing at all, which is refused and logged as a configuration defect.
`apps/api/test/route-declaration.spec.ts` walks every controller in the codebase
and fails if any route lacks a declaration.

**4. Row-level scope, separate from permission.**
Holding `submission.read.assigned` is not permission to read every submission;
it is permission to read the ones belonging to assigned learners.
`AccessScopeService` decides that against the row being touched, and answers an
out-of-scope learner with 404 rather than 403 — a 403 would confirm the learner
exists.

Some rules are not permissions at all and live at the point of decision:

- An examiner cannot review their own submission, though they legitimately hold
  `review.approve`. Checked against the submission's author.
- An approval carries a written rationale of at least 40 characters, validated
  in the DTO and again in the service, so a non-HTTP caller cannot bypass it.
- A decision is made by the examiner holding the item. Claiming is a single
  conditional statement, so two examiners cannot take the same item.

## The audit log

`audit_events` is append-only, and not by convention.

- **Triggers.** `prisma/sql/010_audit_append_only.sql` installs `BEFORE UPDATE`,
  `BEFORE DELETE` and `BEFORE TRUNCATE` triggers that raise.
- **Privileges.** `UPDATE`, `DELETE` and `TRUNCATE` are revoked from the
  application role, which keeps only `INSERT` and `SELECT`.
- **Hash chain.** Each event stores `sha256(prevHash + canonical(event))`. A row
  altered or removed by someone with raw database access breaks the chain, and
  `GET /api/audit/integrity` reports where.

`actorId` is `NOT NULL` with a check constraint, so there is no path to acting
without being recorded as the actor. Reading the log is itself an audited action.

Refusals are recorded too, with outcome `DENIED` — a log of only successful
attempts says nothing about who probed what. This takes two mechanisms, because
Nest runs guards before interceptors: `AuditInterceptor` records refusals raised
inside a handler, and `PermissionsGuard` writes its own record for the ones it
raises itself. Without the second, every permission denial in the system — the
most security-relevant events there are — would have been the only thing missing
from the log. A refusal is filed under the route's own audit action where it
declares one, so a refused approval sits beside the successful ones.

Run `npm run db:harden` after every migration — a migration that recreates the
table drops its triggers with it.

## Requirement gates and waivers

A programme version declares its gates in JSONB, for example
`{ "lessonsCompleted": true, "passMark": 80, "capstoneApproved": true }`.
`CredentialsService.evaluateGates` computes them for a candidate.

An administrator may waive an unmet gate, and has no way to do it quietly. Every
unmet gate must be named in `gateOverrides` with its own reason, or the issue is
refused; the waiver is written onto the credential and printed on the
certificate. Waiving a gate that was actually met is also refused, so the record
never says something untrue.

## Sessions

Sessions are opaque tokens, not JWTs. Only `sha256(token + SESSION_SECRET)` is
stored, so a database leak yields nothing replayable, and suspending an account
or changing a role takes effect on the very next request rather than whenever a
token happens to expire.

The browser holds the token in an `httpOnly` cookie it cannot read. Every call
that uses it happens in a server component or a server action, through a client
marked `server-only`, so importing it into a client component is a build error
rather than a leak. There is no `NEXT_PUBLIC_` variable in the web app: the
browser never learns the API address.

`src/middleware.ts` redirects a manager who lands on `/admin` back to their own
portal. That is routing, not security — it reads a cookie the browser can edit.
Forging it changes which page renders and nothing about what the server will do.

## Tests

```bash
npm test                      # contracts + api, no database needed
npm test -w @aim/contracts    # 82 tests: the matrix, its invariants, the AAI
npm test -w @aim/api          # 238 tests: guards, scope, route coverage, hash chain, content import
```

## Governance: registry, Dx and Rx

The academy teaches this; the registry is where an institution does it.

An agent carries an accountable owner, a defined purpose, a measured index and a
Last Command status. Its recorded AAI changes only when a diagnostic is **bound**
to it, and binding needs `diagnostic.bind.agent` — which the manager and
administrator hold and the candidate and examiner do not. A student practising Dx
on the same agent shape produces a practice record that moves nothing.

An agent whose Last Command is not verified is flagged whatever its index says.
The index measures how much authority exists, not whether it can be taken back.

The AAI itself is `100 × Σ(scores) / 55`, computed in `packages/contracts` so the
API can score with it and the interface can explain it — but only the API scores.
The diagnostic DTO has no `aai` field at all, so a caller that posts one is
refused by the validation pipe before reaching the handler.

## Layout

```
packages/contracts/     permissions, role matrix, prohibitions, shared types
apps/api/
  prisma/schema.prisma  25 models
  prisma/sql/           append-only hardening, re-applied after each migration
  src/common/auth/      session guard, permissions guard, decorators
  src/common/access/    row-level scope
  src/common/audit/     hash-chained audit service and interceptor
  src/modules/          auth, users, academy, cohorts, learning, assessments,
                        submissions, reviews, credentials, audit, settings, reports
apps/web/
  src/lib/              server-only session and API client
  src/app/student|instructor|manager|admin/
```
