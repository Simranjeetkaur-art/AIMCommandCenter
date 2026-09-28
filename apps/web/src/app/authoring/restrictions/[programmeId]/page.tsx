import Link from "next/link";
import { revalidatePath } from "next/cache";
import { GateEditor, type GateStep, type PaperChoice } from "./gate-editor";
import { PERMISSIONS as P } from "@aim/contracts";
import { api, apiOrNull, getSession, apiOrNotFound } from "@/lib/api";
import { Badge, Empty, Panel } from "@/components/ui";
import { RuleFields, type RuleChoices } from "@/components/rule-fields";
import { ConfirmButton } from "@/components/confirm-button";
import { act } from "@/lib/act";

interface UnlockRule {
  id: string;
  type: string;
  requiredProgrammeCode: string | null;
  requiredBadgeCode: string | null;
  requiredCohortId: string | null;
  threshold: number | null;
  opensAt: string | null;
  closesAt: string | null;
  label: string;
  active: boolean;
  position: number;
  createdAt: string;
  createdBy: { name: string };
}

interface TrackGrant {
  id: string;
  reason: string;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  user: { id: string; name: string; email: string };
  grantedBy: { name: string };
}

interface Restrictions {
  programme: {
    id: string;
    code: string;
    title: string;
    level: number;
    levelLabel: string | null;
    tagline: string;
    prerequisiteCode: string | null;
    devAccessFlag: string | null;
    unlockPolicy: "ALL" | "ANY";
    cardStats: string[];
    gateSteps: GateStep[];
    unlockRules: UnlockRule[];
    trackGrants: TrackGrant[];
  };
  /**
   * The rule editor's own choices, plus the papers a gate step may point
   * at. Widened here rather than on `RuleChoices`, which `RuleFields`
   * shares and which has no use for a list of assessments.
   */
  choices: RuleChoices & { assessments: PaperChoice[] };
}

interface Preview {
  user: { id: string; name: string; email: string };
  track: string;
  access: {
    open: boolean;
    policy: string;
    requirementsMet: boolean;
    granted: boolean;
    devAccess: boolean;
    reason: string;
    requirements: Array<{
      id: string;
      type: string;
      label: string;
      met: boolean;
      detail: string;
    }>;
  };
}

const FIELD =
  "rounded-lg border border-ink-700 bg-ink-950/60 px-3 py-2 text-xs";
const BUTTON =
  "rounded-lg border border-ink-700 px-3 py-2 text-xs hover:border-ink-500";

/** Turns a textarea of one-per-line entries into an array, dropping blanks. */
function lines(value: FormDataEntryValue | null): string[] {
  return String(value ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

/** A date input gives a day; the API wants an instant. Blank stays blank. */
function instant(value: FormDataEntryValue | null): string | undefined {
  const day = String(value ?? "").trim();
  return day ? new Date(`${day}T00:00:00.000Z`).toISOString() : undefined;
}

function describe(rule: UnlockRule, choices: RuleChoices): string {
  switch (rule.type) {
    case "CREDENTIAL_HELD":
      return `Holds an active ${rule.requiredProgrammeCode} credential`;
    case "BADGE_HELD": {
      const badge = choices.badges.find(
        (b) => b.code === rule.requiredBadgeCode,
      );
      return `Holds the ${badge?.title ?? rule.requiredBadgeCode} badge`;
    }
    case "COHORT_MEMBER": {
      const cohort = choices.cohorts.find(
        (c) => c.id === rule.requiredCohortId,
      );
      return `Is on ${cohort?.title ?? "a cohort that no longer exists"}`;
    }
    case "MODULES_COMPLETED":
      return `Has finished ${rule.threshold} module${rule.threshold === 1 ? "" : "s"}${
        rule.requiredProgrammeCode
          ? ` of ${rule.requiredProgrammeCode}`
          : " of this track"
      }`;
    case "DATE_WINDOW": {
      const from = rule.opensAt?.slice(0, 10);
      const to = rule.closesAt?.slice(0, 10);
      if (from && to) return `Between ${from} and ${to}`;
      if (from) return `From ${from}`;
      return `Until ${to}`;
    }
    case "MANUAL_GRANT":
      return "Has been admitted by the academy";
    default:
      return rule.type;
  }
}

export default async function RestrictionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ programmeId: string }>;
  searchParams: Promise<{ preview?: string }>;
}) {
  const { programmeId } = await params;
  const sp = await searchParams;
  const session = await getSession();

  const canWriteRules = session.permissions.includes(P.UNLOCK_RULE_WRITE);
  const canGrant = session.permissions.includes(P.TRACK_GRANT_WRITE);
  const canEditLadder = session.permissions.includes(P.PROGRAMME_UPDATE);

  const { programme, choices } = await apiOrNotFound<Restrictions>(
    `/academy/programmes/${programmeId}/restrictions`,
  );

  const candidates = await api<{
    items: Array<{ id: string; name: string; email: string }>;
  }>("/users?role=STUDENT&pageSize=100&sort=name&direction=asc");

  const preview = sp.preview
    ? await apiOrNull<Preview>(
        `/academy/programmes/${programmeId}/restrictions/preview/${sp.preview}`,
      )
    : null;

  const here = `/authoring/restrictions/${programmeId}`;

  async function saveLadder(formData: FormData) {
    "use server";
    await act(`/academy/programmes/${programmeId}/ladder`, {
      method: "PATCH",
      body: {
        level: Number(formData.get("level") ?? 1),
        levelLabel: String(formData.get("levelLabel") ?? ""),
        tagline: String(formData.get("tagline") ?? ""),
        devAccessFlag: String(formData.get("devAccessFlag") ?? ""),
        cardStats: lines(formData.get("cardStats")),
        // Already a mapped list, not lines of prose: the editor posts the
        // whole gate as JSON so a step's requirement travels with its label.
        gateSteps: JSON.parse(String(formData.get("gateSteps") ?? "[]")),
      },
    });
    revalidatePath(here);
  }

  async function setPolicy(formData: FormData) {
    "use server";
    await act(`/academy/programmes/${programmeId}/unlock-policy`, {
      method: "PATCH",
      body: { policy: String(formData.get("policy")) },
    });
    revalidatePath(here);
  }

  async function addRule(formData: FormData) {
    "use server";
    const type = String(formData.get("type"));
    const text = (key: string) => {
      const value = String(formData.get(key) ?? "").trim();
      return value ? value : undefined;
    };
    await act(`/academy/programmes/${programmeId}/unlock-rules`, {
      method: "POST",
      body: {
        type,
        requiredProgrammeCode: text("requiredProgrammeCode"),
        requiredBadgeCode: text("requiredBadgeCode"),
        requiredCohortId: text("requiredCohortId"),
        threshold: formData.get("threshold")
          ? Number(formData.get("threshold"))
          : undefined,
        opensAt: instant(formData.get("opensAt")),
        closesAt: instant(formData.get("closesAt")),
        label: text("label"),
      },
    });
    revalidatePath(here);
  }

  async function toggleRule(formData: FormData) {
    "use server";
    await act(`/academy/unlock-rules/${String(formData.get("ruleId"))}`, {
      method: "PATCH",
      body: { active: formData.get("active") === "true" },
    });
    revalidatePath(here);
  }

  async function moveRule(formData: FormData) {
    "use server";
    await act(`/academy/unlock-rules/${String(formData.get("ruleId"))}`, {
      method: "PATCH",
      body: { position: Number(formData.get("position")) },
    });
    revalidatePath(here);
  }

  async function removeRule(formData: FormData) {
    "use server";
    await act(`/academy/unlock-rules/${String(formData.get("ruleId"))}`, {
      method: "DELETE",
    });
    revalidatePath(here);
  }

  async function addGrant(formData: FormData) {
    "use server";
    const expiresAt = instant(formData.get("expiresAt"));
    await act(`/academy/programmes/${programmeId}/grants`, {
      method: "POST",
      body: {
        userId: String(formData.get("userId")),
        reason: String(formData.get("reason") ?? ""),
        ...(expiresAt ? { expiresAt } : {}),
      },
    });
    revalidatePath(here);
  }

  async function revokeGrant(formData: FormData) {
    "use server";
    await act(`/academy/grants/${String(formData.get("grantId"))}/revoke`, {
      method: "POST",
    });
    revalidatePath(here);
  }

  const live = programme.trackGrants.filter((g) => !g.revokedAt);
  const past = programme.trackGrants.filter((g) => g.revokedAt);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="rule-label">Access restriction</p>
          <h1 className="text-lg font-semibold tracking-tight">
            {programme.code} — {programme.title}
          </h1>
        </div>
        <Link href="/authoring" className={BUTTON}>
          Back to authoring
        </Link>
      </div>

      {/* 3.1 — the ladder, as fields rather than as a deploy. */}
      <Panel
        title="Where this track sits"
        hint="The rung, the wording on the card, and the steps a candidate is shown on the way to certification. None of this is fixed in code."
      >
        {canEditLadder ? (
          <form action={saveLadder} className="space-y-3">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="rule-label mb-1 block">Level</label>
                <input
                  name="level"
                  type="number"
                  min={1}
                  max={9}
                  defaultValue={programme.level}
                  className={`${FIELD} w-20`}
                />
              </div>
              <div>
                <label className="rule-label mb-1 block">
                  Chip on the card
                </label>
                <input
                  name="levelLabel"
                  defaultValue={programme.levelLabel ?? ""}
                  placeholder={`LEVEL ${programme.level}`}
                  className={`${FIELD} w-32`}
                />
              </div>
              <div className="min-w-56 flex-1">
                <label className="rule-label mb-1 block">Tagline</label>
                <input
                  name="tagline"
                  defaultValue={programme.tagline}
                  className={`${FIELD} w-full`}
                />
              </div>
              <div>
                <label className="rule-label mb-1 block">
                  Development access flag
                </label>
                <input
                  name="devAccessFlag"
                  defaultValue={programme.devAccessFlag ?? ""}
                  className={`${FIELD} w-56 font-mono`}
                />
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="rule-label mb-1 block">
                  Chips on the card — one per line
                </label>
                <textarea
                  name="cardStats"
                  rows={4}
                  defaultValue={programme.cardStats.join("\n")}
                  className={`${FIELD} w-full font-mono`}
                />
              </div>
              <div>
                <label className="rule-label mb-1 block">
                  Certification gate — each step says what it requires
                </label>
                <GateEditor
                  name="gateSteps"
                  initial={programme.gateSteps}
                  papers={choices.assessments}
                />
              </div>
            </div>
            <button type="submit" className={BUTTON}>
              Save
            </button>
          </form>
        ) : (
          <Empty>
            Editing the ladder belongs to whoever builds the academy.
          </Empty>
        )}
      </Panel>

      {/* 3.2 — the rules themselves. */}
      <Panel
        title="What opens this track"
        hint="A candidate meets these before training opens. The order they are listed in is the order they are shown, not an order they must be done in."
        action={
          <Badge
            tone={
              programme.unlockRules.some((r) => r.active) ? "amber" : "green"
            }
          >
            {programme.unlockRules.filter((r) => r.active).length === 0
              ? "Open to everyone"
              : `${programme.unlockRules.filter((r) => r.active).length} requirement${
                  programme.unlockRules.filter((r) => r.active).length === 1
                    ? ""
                    : "s"
                }`}
          </Badge>
        }
      >
        {canWriteRules && (
          <form
            action={setPolicy}
            className="mb-4 flex flex-wrap items-center gap-4 text-xs"
          >
            <span className="rule-label">How they combine</span>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="policy"
                value="ALL"
                defaultChecked={programme.unlockPolicy === "ALL"}
              />
              Every requirement
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="policy"
                value="ANY"
                defaultChecked={programme.unlockPolicy === "ANY"}
              />
              Any one of them
            </label>
            <button type="submit" className={BUTTON}>
              Apply
            </button>
          </form>
        )}

        {programme.unlockRules.length === 0 ? (
          <Empty>
            Nothing restricts this track. Any enrolled candidate can begin it.
          </Empty>
        ) : (
          <ul className="space-y-2">
            {programme.unlockRules.map((rule, index) => (
              <li
                key={rule.id}
                className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2 ${
                  rule.active ? "border-ink-700" : "border-ink-800 opacity-50"
                }`}
              >
                <div className="min-w-0">
                  <p className="text-xs">
                    {describe(rule, choices)}
                    {!rule.active && (
                      <span className="ml-2 text-ink-500">— switched off</span>
                    )}
                  </p>
                  <p className="mt-0.5 text-[11px] text-ink-500">
                    {rule.label ? `Shown as: "${rule.label}" · ` : ""}
                    added by {rule.createdBy.name}
                  </p>
                </div>
                {canWriteRules && (
                  <div className="flex items-center gap-2">
                    {index > 0 && (
                      <form action={moveRule}>
                        <input type="hidden" name="ruleId" value={rule.id} />
                        <input
                          type="hidden"
                          name="position"
                          value={index - 1}
                        />
                        <button
                          type="submit"
                          className={BUTTON}
                          title="Move up"
                        >
                          ↑
                        </button>
                      </form>
                    )}
                    <form action={toggleRule}>
                      <input type="hidden" name="ruleId" value={rule.id} />
                      <input
                        type="hidden"
                        name="active"
                        value={String(!rule.active)}
                      />
                      <button type="submit" className={BUTTON}>
                        {rule.active ? "Switch off" : "Switch on"}
                      </button>
                    </form>
                    <form action={removeRule}>
                      <input type="hidden" name="ruleId" value={rule.id} />
                      <ConfirmButton
                        type="submit"
                        confirm={`Remove the requirement "${describe(rule, choices)}"? Candidates held back by it will be let through.`}
                      >
                        Remove
                      </ConfirmButton>
                    </form>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {canWriteRules && (
          <form
            action={addRule}
            className="mt-4 space-y-3 border-t border-ink-800 pt-4"
          >
            <RuleFields choices={choices} />
            <button type="submit" className={BUTTON}>
              Add requirement
            </button>
          </form>
        )}
      </Panel>

      {/* Checking a rule against a real person before it reaches them. */}
      <Panel
        title="Check it against one candidate"
        hint="Evaluated now, against the rules as they currently stand. Reading it changes nothing."
      >
        <form method="get" className="flex flex-wrap items-end gap-3">
          <div>
            <label className="rule-label mb-1 block">Candidate</label>
            <select
              name="preview"
              defaultValue={sp.preview ?? ""}
              className={FIELD}
            >
              <option value="">Choose someone</option>
              {candidates.items.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} — {c.email}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className={BUTTON}>
            Evaluate
          </button>
        </form>

        {preview && (
          <div className="mt-4 rounded-lg border border-ink-700 p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge tone={preview.access.open ? "green" : "red"}>
                {preview.access.open ? "Open" : "Locked"}
              </Badge>
              {preview.access.granted && (
                <Badge tone="amber">Admitted by name</Badge>
              )}
              {preview.access.devAccess && (
                <Badge tone="blue">Development access</Badge>
              )}
              <span className="text-xs text-ink-300">{preview.user.name}</span>
            </div>
            <p className="mb-3 text-xs text-ink-400">{preview.access.reason}</p>
            {preview.access.requirements.length === 0 ? (
              <Empty>No requirements to check.</Empty>
            ) : (
              <ul className="space-y-1">
                {preview.access.requirements.map((req) => (
                  <li
                    key={req.id}
                    className="flex items-center justify-between gap-3 text-xs"
                  >
                    <span
                      className={req.met ? "text-signal-green" : "text-ink-300"}
                    >
                      {req.met ? "✓" : "○"} {req.label}
                    </span>
                    <span className="font-mono text-[11px] text-ink-500">
                      {req.detail}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Panel>

      {/* 3.3 — the named exception. */}
      <Panel
        title="Admitted by name"
        hint="One candidate, past the rules, with a reason. Any credential that follows carries the waiver on its face."
      >
        {live.length === 0 ? (
          <Empty>Nobody has been admitted against the rules.</Empty>
        ) : (
          <ul className="space-y-2">
            {live.map((grant) => (
              <li
                key={grant.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-signal-amber/30 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-xs">
                    {grant.user.name}{" "}
                    <span className="text-ink-500">{grant.user.email}</span>
                  </p>
                  <p className="mt-0.5 text-[11px] text-ink-400">
                    {grant.reason}
                  </p>
                  <p className="mt-0.5 text-[11px] text-ink-500">
                    by {grant.grantedBy.name}
                    {grant.expiresAt
                      ? ` · until ${grant.expiresAt.slice(0, 10)}`
                      : " · no end date"}
                  </p>
                </div>
                {canGrant && (
                  <form action={revokeGrant}>
                    <input type="hidden" name="grantId" value={grant.id} />
                    <ConfirmButton
                      type="submit"
                      confirm={`Revoke ${grant.user.name}'s admission to this track? They lose access immediately.`}
                    >
                      Revoke
                    </ConfirmButton>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}

        {canGrant ? (
          <form
            action={addGrant}
            className="mt-4 space-y-3 border-t border-ink-800 pt-4"
          >
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="rule-label mb-1 block">Candidate</label>
                <select name="userId" required className={FIELD}>
                  {candidates.items.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} — {c.email}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="rule-label mb-1 block">
                  Until <span className="text-ink-500">— optional</span>
                </label>
                <input name="expiresAt" type="date" className={FIELD} />
              </div>
              <div className="min-w-64 flex-1">
                <label className="rule-label mb-1 block">Why</label>
                <input
                  name="reason"
                  required
                  minLength={8}
                  maxLength={400}
                  placeholder="Assessed against the requirement on…"
                  className={`${FIELD} w-full`}
                />
              </div>
            </div>
            <button type="submit" className={BUTTON}>
              Admit
            </button>
          </form>
        ) : (
          <p className="mt-4 border-t border-ink-800 pt-4 text-xs text-ink-500">
            Writing the rules and deciding who is exempt from them are different
            jobs. This one belongs to the institution.
          </p>
        )}

        {past.length > 0 && (
          <details className="mt-4">
            <summary className="cursor-pointer text-xs text-ink-500">
              {past.length} revoked
            </summary>
            <ul className="mt-2 space-y-1">
              {past.map((grant) => (
                <li key={grant.id} className="text-[11px] text-ink-500">
                  {grant.user.name} — {grant.reason} · revoked{" "}
                  {grant.revokedAt?.slice(0, 10)}
                </li>
              ))}
            </ul>
          </details>
        )}
      </Panel>
    </div>
  );
}
