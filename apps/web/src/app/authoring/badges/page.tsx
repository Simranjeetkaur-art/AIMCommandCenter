import Link from "next/link";
import { revalidatePath } from "next/cache";
import {
  BADGE_CRITERIA_LABELS,
  BADGE_CRITERIA_TYPES,
  PERMISSIONS as P,
} from "@aim/contracts";
import { api, getSession } from "@/lib/api";
import { Badge as Chip, Empty, Panel, buttonClass } from "@/components/ui";
import { BadgeMark } from "@/components/badge-mark";
import { ConfirmButton } from "@/components/confirm-button";
import { BadgeArtwork } from "./artwork";
import { act } from "@/lib/act";

interface BadgeRow {
  id: string;
  code: string;
  title: string;
  description: string;
  criteria: {
    type: string;
    assessmentCode?: string;
    programmeCode?: string;
    threshold?: number;
  };
  awardMode: "AUTOMATIC" | "MANUAL";
  programmeCode: string | null;
  active: boolean;
  iconSvg: string | null;
  iconText: string | null;
  tone: string;
  level: number | null;
  position: number;
  createdBy: { name: string };
  _count: { awards: number };
}

function describe(criteria: BadgeRow["criteria"]): string {
  const base =
    BADGE_CRITERIA_LABELS[
      criteria.type as keyof typeof BADGE_CRITERIA_LABELS
    ] ?? criteria.type;
  const parts: string[] = [];
  if (criteria.assessmentCode) parts.push(criteria.assessmentCode);
  if (criteria.programmeCode) parts.push(criteria.programmeCode);
  if (criteria.threshold !== undefined) parts.push(String(criteria.threshold));
  return parts.length > 0 ? `${base} — ${parts.join(" · ")}` : base;
}

export default async function BadgeAuthoring() {
  // Every track an author can attach a badge to, including ones built after
  // the first three. Archived tracks are not offered.
  const trackCodes = (
    await api<Array<{ code: string; status: string }>>("/academy/programmes")
  )
    .filter((p) => p.status !== "ARCHIVED")
    .map((p) => p.code)
    .sort();
  const session = await getSession();
  const canWrite = session.permissions.includes(P.BADGE_WRITE);
  const badges = await api<BadgeRow[]>("/badges");

  async function createBadge(formData: FormData) {
    "use server";
    const threshold = Number(formData.get("threshold") ?? 0);
    const level = Number(formData.get("level") ?? 0);
    const criteriaLevel = Number(formData.get("criteriaLevel") ?? 0);
    await act("/badges", {
      method: "POST",
      body: {
        code: String(formData.get("code") ?? ""),
        title: String(formData.get("title") ?? ""),
        description: String(formData.get("description") ?? ""),
        programmeCode: String(formData.get("programmeCode") ?? "") || undefined,
        iconSvg: String(formData.get("iconSvg") ?? "") || undefined,
        iconText: String(formData.get("iconText") ?? "") || undefined,
        tone: String(formData.get("tone") ?? "brass"),
        level: level > 0 ? level : undefined,
        criteria: {
          type: String(formData.get("type")),
          assessmentCode:
            String(formData.get("assessmentCode") ?? "") || undefined,
          assessmentKind:
            String(formData.get("assessmentKind") ?? "") || undefined,
          programmeCode:
            String(formData.get("criteriaProgramme") ?? "") || undefined,
          level: criteriaLevel > 0 ? criteriaLevel : undefined,
          threshold: threshold > 0 ? threshold : undefined,
        },
      },
    });
    revalidatePath("/authoring/badges");
  }

  async function toggle(formData: FormData) {
    "use server";
    await act(`/badges/${String(formData.get("badgeId"))}`, {
      method: "PATCH",
      body: { active: formData.get("active") === "true" },
    });
    revalidatePath("/authoring/badges");
  }

  async function saveBadge(formData: FormData) {
    "use server";
    await act(`/badges/${String(formData.get("badgeId"))}`, {
      method: "PATCH",
      body: {
        title: String(formData.get("title") ?? ""),
        description: String(formData.get("description") ?? ""),
        programmeCode: String(formData.get("programmeCode") ?? "") || null,
        position: Number(formData.get("position") ?? 0),
      },
    });
    revalidatePath("/authoring/badges");
  }

  async function removeBadge(formData: FormData) {
    "use server";
    await act(`/badges/${String(formData.get("badgeId"))}`, {
      method: "DELETE",
    });
    revalidatePath("/authoring/badges");
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="rule-label">Academy authoring</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          Badges &amp; conditions
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-400">
          A badge is a condition the server evaluates, not a label somebody
          applies. Defining one is academy building, so it needs{" "}
          <span className="font-mono text-brass-500">badge.write</span>.
          Deciding that a candidate has met a manual condition is judgement, so
          that needs{" "}
          <span className="font-mono text-brass-500">badge.award</span> — which
          the instructor holds and the author of the badge does not.
        </p>
      </div>

      {canWrite ? (
        <Panel
          title="Define a badge"
          hint="Automatic badges are awarded the moment their condition becomes true: on the next assessment, review or issuance."
        >
          <form action={createBadge} className="space-y-3">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="rule-label mb-1 block">Code</label>
                <input
                  name="code"
                  required
                  minLength={2}
                  placeholder="CP_DISTINCTION"
                  className="w-44 rounded-lg border border-ink-700 bg-ink-950/60 px-3 py-2 font-mono text-xs"
                />
              </div>
              <div className="flex-1 min-w-44">
                <label className="rule-label mb-1 block">Title</label>
                <input
                  name="title"
                  required
                  minLength={3}
                  className="w-full rounded-lg border border-ink-700 bg-ink-950/60 px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="rule-label mb-1 block">Badge level</label>
                <input
                  name="level"
                  type="number"
                  min={0}
                  max={9}
                  placeholder="1"
                  className="w-20 rounded-lg border border-ink-700 bg-ink-950/60 px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="rule-label mb-1 block">Shown on track</label>
                <select
                  name="programmeCode"
                  className="rounded-lg border border-ink-700 bg-ink-950/60 px-2 py-2 text-xs"
                >
                  <option value="">Any</option>
                  {trackCodes.map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="rule-label mb-1 block">Description</label>
              <input
                name="description"
                className="w-full rounded-lg border border-ink-700 bg-ink-950/60 px-3 py-2 text-xs"
              />
            </div>

            <BadgeArtwork />

            <div className="flex flex-wrap items-end gap-3 rounded-lg border border-ink-800 p-3">
              <div className="min-w-64">
                <label className="rule-label mb-1 block">Condition</label>
                <select
                  name="type"
                  className="w-full rounded-lg border border-ink-700 bg-ink-950/60 px-2 py-2 text-xs"
                >
                  {Object.values(BADGE_CRITERIA_TYPES).map((type) => (
                    <option key={type} value={type}>
                      {BADGE_CRITERIA_LABELS[type]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="rule-label mb-1 block">Assessment</label>
                <input
                  name="assessmentCode"
                  placeholder="CP-SIM"
                  className="w-28 rounded-lg border border-ink-700 bg-ink-950/60 px-3 py-2 font-mono text-xs"
                />
              </div>
              <div>
                <label className="rule-label mb-1 block">Track</label>
                <select
                  name="criteriaProgramme"
                  className="rounded-lg border border-ink-700 bg-ink-950/60 px-2 py-2 text-xs"
                >
                  <option value="">—</option>
                  {trackCodes.map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="rule-label mb-1 block">Level</label>
                <input
                  name="criteriaLevel"
                  type="number"
                  min={0}
                  max={9}
                  placeholder="1"
                  className="w-20 rounded-lg border border-ink-700 bg-ink-950/60 px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="rule-label mb-1 block">Kind</label>
                <select
                  name="assessmentKind"
                  className="rounded-lg border border-ink-700 bg-ink-950/60 px-2 py-2 text-xs"
                >
                  <option value="">—</option>
                  {[
                    "QUIZ",
                    "SIMULATION",
                    "PRACTICAL",
                    "CAPSTONE",
                    "DEFENCE",
                  ].map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="rule-label mb-1 block">Threshold</label>
                <input
                  name="threshold"
                  type="number"
                  min={0}
                  placeholder="5"
                  className="w-20 rounded-lg border border-ink-700 bg-ink-950/60 px-3 py-2 text-xs"
                />
              </div>
              <button type="submit" className={buttonClass("primary", "md")}>
                Define badge
              </button>
            </div>

            <p className="text-[11px] text-ink-400">
              A condition that cannot be answered is refused: a score condition
              needs a threshold, a track condition needs a track. An unearnable
              badge is worse than none, because a candidate has no way to
              discover that it cannot be earned.
            </p>
          </form>
        </Panel>
      ) : null}

      <Panel
        title="Badges"
        hint="Deactivating one stops further awards; awards already made stand."
      >
        {badges.length === 0 ? (
          <Empty>No badges defined.</Empty>
        ) : (
          <ul className="space-y-2">
            {badges.map((badge) => (
              <li
                key={badge.id}
                className="rounded-lg border border-ink-800 p-4"
              >
                <div className="flex flex-wrap items-start gap-4">
                  <BadgeMark
                    iconSvg={badge.iconSvg}
                    iconText={badge.iconText}
                    tone={badge.tone}
                    title={badge.title}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="font-mono text-xs text-brass-500">
                        {badge.code}
                      </span>
                      {badge.level ? <Chip>LEVEL {badge.level}</Chip> : null}
                      <span className="text-sm font-medium">{badge.title}</span>
                      <Chip
                        tone={badge.awardMode === "MANUAL" ? "blue" : "neutral"}
                      >
                        {badge.awardMode}
                      </Chip>
                      {badge.programmeCode ? (
                        <Chip>{badge.programmeCode}</Chip>
                      ) : null}
                      {!badge.active ? <Chip tone="red">Inactive</Chip> : null}
                    </div>
                    <p className="mt-1 text-xs text-ink-400">
                      {badge.description}
                    </p>
                    <p className="mt-1.5 font-mono text-[11px] text-ink-400">
                      {describe(badge.criteria)}
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-xs text-ink-400">
                      {badge._count.awards} held
                    </span>
                    {canWrite ? (
                      <>
                        <form action={toggle}>
                          <input
                            type="hidden"
                            name="badgeId"
                            value={badge.id}
                          />
                          <input
                            type="hidden"
                            name="active"
                            value={String(!badge.active)}
                          />
                          <button
                            type="submit"
                            className={buttonClass("secondary", "md")}
                          >
                            {badge.active ? "Deactivate" : "Activate"}
                          </button>
                        </form>
                        {/* Refused server-side on any badge somebody holds:
                            an award is part of a record, and deactivating is
                            what "can I delete this" almost always means. */}
                        <form action={removeBadge}>
                          <input
                            type="hidden"
                            name="badgeId"
                            value={badge.id}
                          />
                          <ConfirmButton
                            confirm={`Delete the badge "${badge.title}" (${badge.code})? This cannot be undone.`}
                          >
                            Delete
                          </ConfirmButton>
                        </form>
                      </>
                    ) : null}
                  </div>
                </div>

                {canWrite ? (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-[11px] text-ink-500">
                      Edit
                    </summary>
                    <form
                      action={saveBadge}
                      className="mt-2 flex flex-wrap items-end gap-2"
                    >
                      <input type="hidden" name="badgeId" value={badge.id} />
                      <div className="min-w-40 flex-1">
                        <label className="rule-label mb-1 block">Title</label>
                        <input
                          name="title"
                          defaultValue={badge.title}
                          required
                          minLength={3}
                          className="w-full rounded-lg border border-ink-700 bg-ink-950/60 px-3 py-2 text-xs"
                        />
                      </div>
                      <div className="min-w-56 flex-1">
                        <label className="rule-label mb-1 block">
                          Description
                        </label>
                        <input
                          name="description"
                          defaultValue={badge.description}
                          className="w-full rounded-lg border border-ink-700 bg-ink-950/60 px-3 py-2 text-xs"
                        />
                      </div>
                      <div>
                        <label className="rule-label mb-1 block">Track</label>
                        <select
                          name="programmeCode"
                          defaultValue={badge.programmeCode ?? ""}
                          className="rounded-lg border border-ink-700 bg-ink-950/60 px-3 py-2 text-xs"
                        >
                          <option value="">Any track</option>
                          {trackCodes.map((code) => (
                            <option key={code} value={code}>
                              {code}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="rule-label mb-1 block">Order</label>
                        <input
                          name="position"
                          type="number"
                          min={0}
                          defaultValue={badge.position}
                          className="w-20 rounded-lg border border-ink-700 bg-ink-950/60 px-3 py-2 text-xs"
                        />
                      </div>
                      <button
                        type="submit"
                        className={buttonClass("secondary", "md")}
                      >
                        Save
                      </button>
                    </form>
                  </details>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Link
        href="/authoring"
        className="inline-block text-xs text-ink-400 hover:text-ink-200"
      >
        Back to courses
      </Link>
    </div>
  );
}
