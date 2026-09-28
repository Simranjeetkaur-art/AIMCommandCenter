# AIM Command Center — gap register

Walked every page as student, instructor, manager and administrator, and checked
all 96 API routes against create / read / update / delete / disable.

**47 gaps · 14 blocking · 0 broken pages · 0 boundary leaks.** Nothing is
mis-secured; what follows is what cannot yet be _done_.

Priorities: **P1** blocks real use · **P2** needed before anyone else operates
the system · **P3** polish.

---

## Closed so far

Implementation started from P1. Each item below is built, wired to a screen,
and verified against the running system rather than only typechecked.

| #           | What closed it                                                                                                                                                                                                | Checks |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 1.1 1.2 1.3 | Users page rebuilt: server-side role/status/search/sort/paging, inline edit, archive with a mandatory reason, restore                                                                                         | 31     |
| 1.4 1.5     | Suspension takes an end date and lapses by itself; `/admin/users/[id]` shows one person whole                                                                                                                 | —      |
| 2.1         | Modules carry their own overview and learning outcomes                                                                                                                                                        | 3      |
| 2.2         | Tracks, modules, lessons and assessments can be hidden; hidden means 404 to a candidate and visible to the author                                                                                             | 11     |
| 2.3 2.4     | Assessments can be edited and removed; lessons can be removed. Both refuse to erase work people have done                                                                                                     | 6      |
| 3.1         | The ladder is a form: level, chip, tagline, card chips, gate steps, dev-access flag                                                                                                                           | 19     |
| 3.2         | Six kinds of restriction, combined by ALL or ANY, editable per track, with a live preview against one named candidate                                                                                         | 52     |
| 3.3         | One candidate admitted past the rules by name, with a reason, and the waiver stamped on any credential that follows                                                                                           | —      |
| 5.1         | Role preview: an administrator opens any portal without a password and without becoming anyone                                                                                                                | 69     |
| 5.2         | Four domain tiles — Dx, Rx, Academy, Certification — each cross-checked against the screen behind it                                                                                                          | 63     |
| 6.1         | Cohorts rename, archive and refuse to close over active learners                                                                                                                                              | 5      |
| 5.3 7.3     | The mission simulator: one scenario at a time, in order, marked on the server with the reasoning given at once, resumable, and with the option order shuffled per candidate                                   | 121    |
| 2.8         | Changing a published track: the route from a live version to a draft is always offered and explained, the draft is a faithful copy of what it came from, and a draft can be discarded from the row it sits on | 49     |
| 2.5 2.6 8.2 | Question banks placed under a track and module, tagged and searchable; papers built by picking from them; abandoned drafts discardable                                                                        | 107    |
| 4.1 7.1 7.2 | The certificate designer, the Command Dashboard and the Certification Center; the certificate sheet is one shared component, so the designer's preview and the candidate's page cannot drift                  | 171    |
| 1.6         | Passwords and sessions: change your own, forget it and reset it, be reset by an administrator, be locked out by guessing, and see and end everything signed in as you                                         | 62     |

**Still open at P1:** one — 8.5, found while fixing 3.5 and verified against the running system. Everything else was verified, not assumed. Every P1 was re-checked
against the running system on 21 September: 16 gaps, 60 checks, all passing.
Each was tested at the layer it actually complained about, because several were
never "the API lacks it" but "the screen does not call it".

The section tables below had gone stale: eleven rows still carried **P1** while
the summary above called them closed. A register that disagrees with itself is
worse than one that is merely out of date, so they now read as closed with what
closed them.

**Auth** is described below. Its migration,
`20260921120000_password_lifecycle_and_session_control`, is applied and the
schema is up to date; 25 users were backfilled with a `passwordChangedAt`, and
none were forced to the password screen. Forcing applies only where somebody
else chose the password — an account created by an administrator, or a
temporary password they set.

### Passwords and sessions

What existed was a sign-in, a sign-out and a role preview. What did not exist
was every other thing a person does with a password: change it, forget it, be
helped with it, or find out what is signed in as them. The register called this
1.6 and rated it P2; it is the sort of gap that reads as polish until somebody
loses a laptop.

**The policy lives in `contracts`, not in the API.** The screen that collects a
password and the server that refuses it have to apply the same rule, and the
only way to guarantee that is for there to be one rule — a form that accepts
eleven characters and a server that demands twelve is not a validation bug, it
is two different products. `checkPassword` returns _every_ broken rule rather
than the first, because a form that reveals one at a time turns choosing a
password into a guessing game, which is how people end up choosing a worse one.
The composition rule is deliberately not one-upper-one-digit-one-symbol: that
reliably produces `Password2026!` and reliably refuses `correct horse battery
staple`, which is backwards. Length does the work.

**Two brakes on guessing, because they catch different attacks.**
`User.lockedUntil` counts failures against one account — durable, visible to an
administrator, clearable by one, and it lifts by itself because a lock somebody
has to ring up about is a lock that gets switched off. `LoginThrottle` counts by
origin, in memory, and catches the thing a per-account column structurally
cannot see: one machine trying one likely password against every address on the
roll, where no single account ever reaches its own limit. A locked account is
refused _before_ it is looked at, in the same words as every other failure, and
still spends argon2's full cost against a dummy hash — otherwise the lockout
becomes the account oracle that dummy hash exists to prevent.

**A reset link is a credential, not a URL.** Only its hash is stored, under a
different domain separator from session tokens, so a stolen session token
cannot be presented at the reset endpoint or the other way round. It is
single-use, it dies in thirty minutes, and issuing one voids every earlier
unspent token — a forwarded mail from last week should not still be a way in.
`POST /auth/password/forgot` answers _identically_ for an address that has an
account and one that does not: same status, same body, no field that differs.
A reset form that says "no such user" is a way to enumerate the roll.

**An administrator can end a password. They cannot read one.** There is no
column a password could be read back from, and `password.read` stays in
`NON_EXISTENT_CAPABILITIES`. What they get is two modes, because the situations
differ: a **link**, which changes nothing until the person spends it — so
resetting the wrong account has locked nobody out — and a **temporary
password**, which takes effect at once for the case where the person is
standing there and their mailbox is what they have lost. The link is returned
to the administrator on screen rather than mailed, because they asked for it on
somebody's behalf and the audit log records that they did; the self-service
path never returns a token to anyone, because there nobody has proved they are
entitled to it.

**A password somebody else chose is not your password.** An account created by
an administrator, or given a temporary password, is _held_: SessionGuard
refuses every route but the four that screen needs, so the string an
administrator typed into a form and very possibly sent over chat is good for
exactly one sign-in and nothing else. That is a server boundary, not a redirect
— a caller with a valid bearer token cannot reach one route by skipping the
browser.

**Ending somebody's session became its own permission.** It had been
`user.suspend`, on the reading that both stop a person being signed in. They
are not the same act: a laptop left on a train is not a disciplinary matter,
and the control for it should not be the one that stops somebody working. Every
revocation now records _why_ it happened, so a person reads "you changed your
password on another device" instead of "your session ended" — the difference
between those two is one column.

**Delivery is a port, and says so.** This system has no mail transport and
pretending otherwise would have been worse than admitting it. `ResetDelivery`
is an interface with one seam; the shipped implementation logs the link in
development and, in production, refuses to log the token at all and says
loudly that nothing is bound. A reset token in a log aggregator is a password
reset anybody with log access can perform.

#### Two bugs, both found by driving it rather than typechecking

1. **The refusal the whole feature turns on was invisible.** `SessionGuard`
   threw a 403 carrying `code: PASSWORD_CHANGE_REQUIRED` so the web
   application could tell a password hold from an ordinary permission refusal
   — one sends the person to the password screen, the other is the matrix
   doing its job. `AllExceptionsFilter` rebuilds every error body from scratch
   and dropped the code on the floor. Nothing was insecure; the guard still
   refused. What broke was the interface's ability to tell the two apart, so a
   held account would have been bounced from page to page with no way to reach
   the screen that clears it. A thrown body may now name itself, and it lands
   in the existing `error` field rather than a second one meaning the same
   thing. Pinned by
   [`exception-filter.spec.ts`](apps/api/test/exception-filter.spec.ts).
2. **`Session.lastSeenAt` was displayed and never written.** The administrator's
   user record showed "last seen", which is what distinguishes a live session
   from one somebody abandoned, and the column had held its creation time since
   the row was made. It is now touched at most once a minute per session —
   often enough to mean something, rarely enough not to add a write to every
   read in the system.

#### Where two sessions collided

Three of us were in this tree at once, and for a while there were two ways to
end somebody's session: `DELETE /users/:id/sessions/:sessionId` under
`user.suspend`, and `POST /users/:id/sessions/revoke` under a new
`user.session.revoke`, taking one or all and demanding a stated reason. Two
routes for one act, guarded by different permissions, is exactly the drift this
codebase argues against everywhere else. The user chose the second; the first
is gone, its two good properties folded in — it refuses to cut the session
you are sitting in, and it scopes by user and session together so an id
belonging to somebody else answers 404 rather than 403, following
`AccessScopeService` in hiding an out-of-scope subject rather than confirming
it. The admin screen that called the removed route was re-pointed in the same
change, so nothing was left calling a 404.

Verified against a running server: **62 end-to-end checks**, plus 413 API and
191 contract tests, and `GET /audit/integrity` clean across 6,006 events
afterwards.

### The lesson screen, and the bug under it

Rebuilt to the design: the header's reading time, question count and pass mark
are **named fields** rather than a free-text chip list (backfilled from the
existing chips, 20 lessons); learning objectives and key terms are **one row
each** with move-up, move-down and remove; sections and callouts reorder the
same way; and the right-hand panel is a **live preview** rendered by
`LessonView` -- the same component the candidate's page uses, so there is no
second implementation to drift. `lessonChips()` composes the header in
contracts for the same reason.

Two real bugs, both found by driving it rather than by typechecking:

1. **The three callout kinds added for this screen could never be saved.**
   `assertLessonContent` decided emptiness from `body` and `items` alone, so a
   key-terms callout (content in `terms`) and a link (content in `url` /
   `label`) were offered by the editor and refused by the server as "empty".
   Now pinned by
   [`lesson-content.spec.ts`](apps/api/test/lesson-content.spec.ts).
2. **"Section 7 needs a heading" on a section that had one** -- the real
   complaint was a two-character minimum. The message now says so.

And a content defect the verification surfaced: the importer turned every
inline tag into a space, so `<strong>capability</strong>,` became
"capability ," and candidates read _"capability , autonomy , authority ;"_.
Fixed in the parser and backfilled -- 19 strings across 16 lessons.

### The academy, as the three steps it actually is

Navigation now names the domains: Academy, Users, Agents, AIM&trade; Dx,
AIM&trade; Rx, Badges, Certification. Rx had no index at all -- only a page per
diagnostic -- so `GET /prescriptions` and a screen were added.

**1 Learn.** Tracks have full CRUD. A lesson already carried an about section,
outcomes and numbered sections; it now also carries **key terms**, **references**
and **links**, so anything an author wants to highlight has somewhere to go. A
link renders as a link only for `http(s)`: anything else, `javascript:` being
the one that matters, renders as text.

**2 Assessment.** A question bank used to be a free-floating list with a title,
which made "the questions for module 3 of AIM-CP" something you found by
reading titles. A bank now belongs to a track and a module and carries tags,
both optional so a shared bank stays possible. Questions carry tags of their
own. An assessment sits under a module, and its paper is built by picking from
the banks that serve that module -- as one act, because doing it a question at
a time makes a twenty-question paper twenty chances to half-finish.

**3 Earn badge.** Choosing a badge on the assessment form writes _that badge's_
condition to "passed this assessment". The alternative -- a column on the
assessment naming a badge -- would be a second place deciding who holds one,
and the two would eventually disagree. Badges can now be edited and deleted;
deleting refuses on any badge a learner holds, because an award is part of a
record.

**Users** show last sign-in, per-track progress with a module-by-module
breakdown, and every attempt with how many of the allowed ones are used.

Closing **8.2** fell out of this: an author who clones a version and thinks
better of it had no way to discard the draft, and each clone copies the whole
syllabus. `DELETE /academy/versions/:id` takes a draft nobody is on -- never a
published one, never one with a cohort, a credential or an attempt against it.
Six abandoned drafts went, and the content is back to the 30 modules, 30
lessons and 42 assessments the syllabus defines, from 40 and 56.

### How role preview was built, and why that way

The obvious implementation is impersonation — act as someone else — and it is
the wrong one: it breaks the rule the audit log rests on, that the person who
did a thing is the person recorded as having done it. There is no
`actor.impersonate` in the vocabulary and this is not a quiet version of it.

Preview **narrows**. While it is on, the session holds the previewed role's
_read_ permissions and nothing else — 13 instead of the administrator's 60 —
and their identity is untouched. Two independent locks:

1. Only permissions on an explicit read-only list are ever held
   ([`preview.ts`](packages/contracts/src/preview.ts)), and
   [`preview.spec.ts`](packages/contracts/test/preview.spec.ts) asserts the
   list can never widen: every prohibition on the previewed role still holds,
   no judgement, no credential lifecycle, never the answer key.
2. Every request that is not a read is refused outright while a preview is on,
   whatever permissions say — so a mistake in that list still cannot become a
   write.

Found on the way: **`PermissionsGuard` was checking `actor.role`, not
`actor.permissions`.** Identical in normal operation, and it would have made
the narrowing decorative. It now checks what the actor actually holds.

### What the overview tiles are counting

The administrator's overview was four tiles about the audit log, which says how
much has happened and nothing about what the institution holds. It now leads
with the four things this system is for, and the log sits below them.

`GET /reports/overview` counts every figure server-side in one call — a tile
that disagrees with the screen behind it is worse than no tile — and returns
**null** for sections the caller may not read, rather than one blanket
permission that would either lock a manager out of academy figures they are
responsible for or hand them credential counts they do not hold. A manager gets
Dx, Rx and Academy; Certification comes back null, and the panel is simply not
drawn. Verified by reading the same endpoint under a MANAGER preview.

Two things the tiles make visible that were previously only reachable by
looking: agents in the register with **no bound diagnostic**, and credentials
carrying a **waived requirement**. An institution that cannot see how many of
its credentials went round a gate is not really enforcing the gate.

### Three bugs the verification found

1. **A visibility-only edit was refused on a published version.** `class-transformer`
   leaves every declared optional field on the object as `undefined`, so counting
   keys counted fields nobody had sent. Same shape of bug in three places.
2. **Delete guards reported the wrong reason.** "This version is published" fired
   before "two people have sat this", so the specific refusal was never reached
   and its test passed for the wrong reason.
3. **Cycles could be assembled through switched-off rules.** The ladder walk
   followed only _active_ rules, so switching A's rule off, adding the opposite
   rule on B, and switching A's back on built a pair of tracks requiring each
   other — with only the last step refused, by which point the data was already
   wrong. Now an inactive rule counts as an edge, with
   [`unlock-graph.spec.ts`](apps/api/src/modules/academy/unlock-graph.spec.ts)
   holding it there.

---

## CRUD completeness

| Resource               | Create | Read | Update              | Delete              | Disable          | Reorder      |
| ---------------------- | ------ | ---- | ------------------- | ------------------- | ---------------- | ------------ |
| users                  | yes    | yes  | yes                 | archive (by design) | suspend, timed   | n/a          |
| programmes             | yes    | yes  | yes                 | **none**            | column, no UI    | n/a          |
| versions               | yes    | yes  | publish only        | **none**            | **no unpublish** | n/a          |
| modules                | yes    | yes  | yes                 | yes                 | **none**         | number field |
| lessons                | yes    | yes  | yes                 | **none**            | **none**         | **none**     |
| assessments            | yes    | yes  | **none**            | **none**            | **none**         | n/a          |
| questions              | yes    | yes  | yes                 | yes                 | **none**         | **none**     |
| question banks         | yes    | yes  | **none**            | **none**            | **none**         | n/a          |
| badges                 | yes    | yes  | yes                 | **none**            | yes              | no UI field  |
| cohorts                | yes    | yes  | **none**            | **none**            | **none**         | n/a          |
| enrollments            | yes    | yes  | withdraw            | **none**            | withdraw         | n/a          |
| agents                 | yes    | yes  | yes                 | retire (by design)  | yes              | n/a          |
| credentials            | yes    | yes  | lifecycle only      | revoke (by design)  | yes              | n/a          |
| ladder / prerequisites | n/a    | yes  | API only, **no UI** | n/a                 | column, no UI    | **none**     |

---

## 1 · Users

| #   | Gap                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Pri |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| 1.1 | ~~**No filter, search or sort.** Twenty users render as one flat list. The API accepts `?role=` and `?search=`; the page passes neither, and there is no pagination control although the endpoint paginates.~~ **Closed.** The roll filters by role and status, searches, sorts and pages, all server-side.                                                                                                                                                                                                                                                      | —   |
| 1.2 | ~~**Cannot edit a user.** There is no `PATCH /users/:id` at all. A name typo or a changed email is unfixable from the interface or the API.~~ **Closed.** `PATCH /users/:id` exists and the roll edits a row inline. The correction demands a stated reason, so it lands in the audit log.                                                                                                                                                                                                                                                                       | —   |
| 1.3 | ~~**Cannot remove a user.** No delete and no archive. Thirteen of twenty accounts are test data with no way to clear them.~~ **Closed.** Archive with a mandatory reason, and restore. Nothing is destroyed; an archived account leaves the roll and is counted on its own tile.                                                                                                                                                                                                                                                                                 | —   |
| 1.4 | ~~**Suspension has no end date.**~~ **Closed** — see the summary table: suspension takes an end date and lapses by itself                                                                                                                                                                                                                                                                                                                                                                                                                                        | —   |
| 1.5 | ~~**No user detail view.**~~ **Closed** — `/admin/users/[id]` shows one person whole                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | —   |
| 1.6 | ~~**No password reset or session control.**~~ **Closed.** Change your own password, forget it and reset it by link, be reset by an administrator either way, be locked out by repeated guessing and let back in. Everything signed in as you is listed and can be ended, by you or by the institution. Email verification, 2FA, helmet and explicit CORS remain out of scope and are not claimed.                                                                                                                                                                | —   |
| 1.8 | **Nothing prunes session rows.** The Session model's own comment says they "expire and are pruned"; there is no pruner. They expire logically and the rows stay for ever. Measured on the development database after a day of testing: **1,500 rows, 966 of them still live**, 482 against the seeded administrator alone — because every sign-in mints a row and nothing signs out. Each live row is a valid credential until its TTL lapses. Found while building the session panel, which is why that list is now capped at 25 with the true total beside it. | P3  |
| 1.7 | **No bulk actions.** Enrolling or suspending twenty people means twenty actions.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | P3  |

## 2 · Academy structure

Against the hierarchy described: Academy → Course → Module → questions → final
exam → certificate.

| #   | Gap                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Pri |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| 2.1 | ~~**Module has no learning outcomes of its own.** Objectives live on the _lesson_; a module carries only title and summary, so "overview, description, learning outcomes" has nowhere to sit at module level. Schema change.~~ **Closed.** A module carries its own overview and learning outcomes, editable on a draft.                                                                                                                                                                                                                                                                                                                                                            | —   |
| 2.2 | ~~**Nothing can be hidden.** No visibility switch on a track, module, lesson or assessment. The only way to remove something from a candidate's view is deletion — which lessons and assessments do not support.~~ **Closed.** Track, module, lesson and assessment all take a visibility switch. Hidden reads as 404 to a candidate and stays visible to the author.                                                                                                                                                                                                                                                                                                               | —   |
| 2.3 | ~~**Assessments cannot be edited or removed.** Pass mark, attempt limit and examiner-reviewed flag are fixed at creation. No `PATCH`, no `DELETE`.~~ **Closed.** Title, pass mark, attempt limit and the examiner-reviewed flag are all editable, and an assessment can be deleted -- refused where people have sat it.                                                                                                                                                                                                                                                                                                                                                             | —   |
| 2.4 | ~~**Lessons cannot be deleted.**~~ **Closed** — lessons can be removed, and the delete refuses to erase work people have done                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | —   |
| 2.5 | ~~**No reordering.**~~ **Closed** — closed alongside the question-bank work                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | —   |
| 2.6 | ~~**Question banks are write-only.**~~ **Closed** — banks sit under a track and module, are tagged and searchable, and papers are built by picking from them                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | —   |
| 2.7 | ~~**No preview as a candidate.**~~ **Closed.** A lesson already previewed live in its editor through `LessonView`; a paper now does the same through **`AssessmentRunner`**, the candidate's own component in a read-only mode. The page calls `/assessments/:id/paper` — the candidate's route — so the answer key is absent from the payload rather than merely unrendered, and a hidden paper still previews, because an author has to read what they have not yet published                                                                                                                                                                                                     | —   |
| 2.8 | ~~**No route from a published version.**~~ **Closed.** The Revise control was hidden whenever any draft existed, so a track with abandoned drafts offered no way to change it and said nothing about why. Now always offered, on the track list and on the published version's own screen. Two real bugs fixed under it: the clone dropped module overview, outcomes and every `visible` flag and did not remap `assessment.moduleId`; and it suffixed assessment codes with `-V{n}`, which broke the `-ASSESS` ending the product groups module papers by, silently reclassifying every module paper as a milestone. Codes are now prefixed, and 168 existing codes were repaired. | —   |

## 3 · Access restriction

| #   | Gap                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Pri |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| 3.1 | ~~**The ladder has no interface.** Level, prerequisite, gate steps and card chips are database columns with a working endpoint that nothing in the UI calls. The sequence can only be changed with an API client.~~ **Closed.** Level, chip, tagline, card chips, gate steps and the dev-access flag are a form; the prerequisite is set as an unlock rule's required track.                                                                                                                                                                                                                                                                                                                                                                 | —   |
| 3.2 | ~~**Only one kind of restriction exists.** A track unlocks on "holds credential X". No gating on a badge, a cohort, a date window, a manual grant, or nothing at all.~~ **Closed.** Six kinds -- credential, badge, modules completed, cohort, date window and manual grant -- combined by ALL or ANY, with a live preview against one named candidate.                                                                                                                                                                                                                                                                                                                                                                                      | —   |
| 3.3 | ~~**No per-person exception.**~~ **Closed** — one candidate admitted past the rules by name, with a reason, stamped on any credential that follows                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | —   |
| 3.4 | ~~**Gate steps are inferred, not mapped.**~~ **Closed.** A step now carries its requirement — prerequisite, lessons, a named paper, or the credential — instead of having its meaning recovered by running regular expressions over its label and then resolving to the _first_ assessment of that kind. Two quizzes no longer light the wrong step, and renaming a step can no longer silently unmap it. The column is JSON, so no migration: bare-string steps are still read, marked `inferred`, and shown in the editor as **Guessed from the label** until an author states what they mean. Saving a step that names a paper not on the track is refused, because an unmeetable gate reports nothing. 20 tests in `gate-steps.spec.ts`. | —   |
| 3.5 | ~~**A learner's completed modules count as zero once a newer version is published.**~~ **Closed.** Finished modules are now counted across every version of the track and deduplicated by module code, so a candidate on a retired version keeps their work and a candidate with progress on two versions is not counted twice. The seeded candidate went from `0 of 3` to `10 of 3` and AIM-CA opened. `restrict.mjs` went 50/2 to 52/0; pinned by `modules-counted.mjs` (13 checks) covering both the under-count and the over-count.                                                                                                                                                                                                      | —   |

## 4 · Certificates and badges

| #   | Gap                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Pri |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| 4.1 | ~~**No certificate designer.**~~ **Closed.** Wording, signatory, signature, seal, logo, accent and orientation, per track or as the house design every track falls back to; artwork through the same allow-list badge artwork uses; live preview on the same component the candidate is shown.                                                                                                                                                        | —   |
| 4.2 | ~~**The certificate cannot leave the screen.**~~ **Closed.** A print stylesheet puts the sheet alone on white paper, remaps the dark-ground ink scale so it is legible, keeps the author's accent, and sets the page box from the design's own orientation. “Print or save as PDF” on the candidate's certificate and “Proof on paper” in the designer, both through the browser's own dialog — no second renderer that could disagree with the first | —   |
| 4.3 | ~~**Badges cannot be deleted or reordered.**~~ **Already closed** — verified in code, not assumed: `DELETE /badges/:id` refuses any badge a learner holds, and the authoring form carries an **Order** field bound to `position`, which the list is sorted by. The row was stale                                                                                                                                                                      | —   |
| 4.4 | **No badge preview as a candidate.**                                                                                                                                                                                                                                                                                                                                                                                                                  | P3  |

## 5 · Administrator's view of the whole

| #   | Gap                                                                                                                                                                                                                                                                                                                                                                     | Pri |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| 5.1 | ~~**No role preview.** Confirmed by the page sweep: an administrator is redirected away from `/student`, `/instructor` and `/manager`. No way to see what another role sees without their password.~~ **Closed.** An administrator opens any portal without a password and without becoming anyone. Authority is narrowed, never widened, and the preview is read-only. | —   |
| 5.2 | ~~**Overview shows only audit and credentials.** Four tiles, all about the log. Nothing states what Dx, Rx, the Academy or certification hold.~~ **Closed.** Four domain tiles -- Dx, Rx, Academy, Certification -- each carrying figures cross-checked against the screen behind it.                                                                                   | —   |
| 5.3 | ~~**No practice simulator.**~~ **Closed.** The simulator runs at `/student/simulator`; the site-preview half of this gap is 5.1 and is also closed.                                                                                                                                                                                                                     | —   |
| 5.4 | **Reports stop at two.** Cohort progress and review turnaround. No per-learner, badge or credential report, and no export.                                                                                                                                                                                                                                              | P2  |

## 6 · Cohorts and grouping

| #   | Gap                                                                                                                                                                                                                           | Pri |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| 6.1 | ~~**Cohorts cannot be edited or closed.** Create and read only — no rename, date change, archive or delete.~~ **Closed.** Cohorts rename and archive, and refuse to close over active learners.                               | —   |
| 6.2 | ~~**Enrolment is one-way in the interface.**~~ **Closed** — `/manager/cohorts/[id]` carries the roll, with enrol, withdraw and per-learner examiner assignment. Moving a learner between cohorts is still withdraw-then-enrol | —   |
| 6.3 | **No grouping beyond cohorts.** Every grouping is a cohort tied to one programme version — no general group by employer, region or intake.                                                                                    | P2  |

## 7 · Missing screens

| #   | Gap                                                                                                                                                                                                                                                    | Pri |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --- |
| 7.1 | ~~**Command Dashboard**~~ **Closed.** Hero, the four route cards — assess, prescribe, qualify, certify — and the command strip. Where each card leads depends on the role.                                                                             | —   |
| 7.2 | ~~**Certification Center**~~ **Closed.** The five requirements against real gate state, per track; profile, credential, badges and the verification reference. A requirement the track does not define is marked as such rather than left outstanding. | —   |
| 7.3 | ~~**100-Mission Simulator**~~ **Closed.** Ten bands, one mission at a time, running score and ceiling, end-run, per-mission debrief.                                                                                                                   | —   |
| 7.4 | **Dx gauge and risk scale** — scoring and banding work; gauge, legend and concentration bars missing.                                                                                                                                                  | P2  |
| 7.5 | **Rx Situation Analysis** — controls are ranked, but the narrative and numbered driver cards differ from the prototype.                                                                                                                                | P2  |
| 7.6 | **Academy hero** — "Learn to command autonomous AI" and the what-you-will-learn panel.                                                                                                                                                                 | P3  |

## 8 · Data hygiene

Left behind by verification runs during the build.

| #   | Gap                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Pri  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- |
| 8.1 | **Thirteen test accounts on the roll**, with nine revoked credentials attached. No interface can remove them.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | P2   |
| 8.2 | ~~**Orphaned content from a cloned version.**~~ Closed: drafts can be discarded, and the six abandoned ones were.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | done |
| 8.3 | **Thirty-five duplicate diagnostics** against the same three agents, making Dx history unreadable.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | P3   |
| 8.5 | **Badges over-count modules across versions, and award credentials nobody earned.** The badge evaluator answers the same question as unlock gap 3.5 and answers it the opposite wrong way: `badges.service.ts:315` tallies completed modules keyed on the module ROW id, so the same module carried into a second version counts twice. **Verified, not inferred:** a probe badge requiring 11 modules was awarded to the seeded candidate, who has completed 10 — a duplicate `CP-001` row on another draft supplied the eleventh. Badges feed the certification gate, so this hands out recognition that was not earned, which in a certification product is worse than the under-count that locked people out. The fix is the one already applied to `track-access.service.ts`: deduplicate by module code, falling back to position. `evaluateFor` only ever awards and never revokes, so correcting it stops future over-awards without disturbing anything already held. | P1   |

---

## One decision to make first

Items **1.3, 2.2 and 6.1** are the same question three times: _what happens to a
thing you no longer want?_

Recommendation: **archive everywhere, delete almost nowhere.** A user, cohort or
module gets hidden and keeps its history; only genuinely empty drafts are
destroyed. Deleting a user would orphan every audit event they caused, which is
the one thing this system is built not to allow.

## Proposed order

1. Users — CRUD, filters, detail view, timed deactivation
2. Archive / hide everywhere — tracks, modules, lessons, assessments, cohorts
3. Ladder and restriction UI — editable levels, prerequisites, gate steps
4. Role preview — administrator sees any portal, recorded as themselves
5. Admin overview tiles — Dx, Rx, Academy, Certification
6. Certificate designer — signature, seal, template, preview, print
7. ~~100-Mission Simulator~~ — done
8. Certification Center
