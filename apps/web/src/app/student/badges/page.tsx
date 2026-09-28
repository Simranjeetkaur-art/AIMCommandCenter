import { BADGE_CRITERIA_LABELS } from "@aim/contracts";
import { api } from "@/lib/api";
import { Badge, Empty, Panel, Stat } from "@/components/ui";
import { BadgeMark } from "@/components/badge-mark";

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
  iconSvg: string | null;
  iconText: string | null;
  tone: string;
  level: number | null;
  held: boolean;
  awardedAt: string | null;
  awardedBy: string | null;
  reason: string | null;
  revokedAt: string | null;
  revokedReason: string | null;
}

function condition(criteria: BadgeRow["criteria"]): string {
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

export default async function BadgesPage() {
  const badges = await api<BadgeRow[]>("/badges/mine");
  const held = badges.filter((b) => b.held);
  const open = badges.filter((b) => !b.held && !b.revokedAt);
  const withdrawn = badges.filter((b) => b.revokedAt);

  const card = (badge: BadgeRow) => (
    <li
      key={badge.id}
      className={`rounded-lg border p-4 ${
        badge.held
          ? "border-signal-green/40 bg-signal-green/5"
          : "border-ink-800"
      }`}
    >
      <div className="flex flex-wrap items-start gap-4">
        <BadgeMark
          iconSvg={badge.iconSvg}
          iconText={badge.iconText}
          tone={badge.tone}
          held={badge.held}
          title={badge.title}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="font-mono text-xs text-brass-500">
              {badge.code}
            </span>
            {badge.level ? <Badge>LEVEL {badge.level}</Badge> : null}
            <span className="text-sm font-medium">{badge.title}</span>
            {badge.programmeCode ? <Badge>{badge.programmeCode}</Badge> : null}
            {badge.awardMode === "MANUAL" ? (
              <Badge tone="blue">Instructor awarded</Badge>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-ink-400">{badge.description}</p>
          <p className="mt-1.5 text-[11px] text-ink-400">
            <span className="rule-label">Earned by</span>{" "}
            <span className="font-mono">{condition(badge.criteria)}</span>
          </p>
        </div>
        {badge.held ? <Badge tone="green">Earned</Badge> : null}
      </div>

      {badge.held && badge.reason ? (
        <p className="mt-2 border-l-2 border-signal-green/40 pl-3 text-xs leading-relaxed text-ink-200">
          {badge.reason}
          {badge.awardedBy ? (
            <span className="mt-0.5 block text-[11px] text-ink-400">
              — {badge.awardedBy}
            </span>
          ) : null}
        </p>
      ) : null}

      {badge.revokedAt ? (
        <p className="mt-2 border-l-2 border-signal-red/40 pl-3 text-xs text-signal-red">
          Withdrawn: {badge.revokedReason}
        </p>
      ) : null}
    </li>
  );

  return (
    <div className="space-y-6">
      <div>
        <p className="rule-label">AIM™ Academy</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Badges</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-400">
          Each badge names the condition that earns it, and the condition is
          evaluated on the server the moment it can become true. Nothing here is
          awarded by asking.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Earned" value={held.length} />
        <Stat label="Still open" value={open.length} />
        <Stat label="Defined in total" value={badges.length} />
      </div>

      <Panel title="Earned">
        {held.length === 0 ? (
          <Empty>
            No badges yet. Every one below tells you how to earn it.
          </Empty>
        ) : (
          <ul className="space-y-2">{held.map(card)}</ul>
        )}
      </Panel>

      <Panel title="Still open" hint="What each one takes.">
        {open.length === 0 ? (
          <Empty>Nothing left to earn.</Empty>
        ) : (
          <ul className="space-y-2">{open.map(card)}</ul>
        )}
      </Panel>

      {withdrawn.length > 0 ? (
        <Panel
          title="Withdrawn"
          hint="An award that was made and then withdrawn, with the reason."
        >
          <ul className="space-y-2">{withdrawn.map(card)}</ul>
        </Panel>
      ) : null}
    </div>
  );
}
