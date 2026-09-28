import Link from "next/link";
import type { ReactNode } from "react";
import { Badge, Empty, Panel } from "@/components/ui";
import { Bars, Gauge, StackedBar } from "@/components/charts";

/** The four things this system is for. */
export interface InstitutionOverview {
  dx: DxSection | null;
  rx: RxSection | null;
  academy: AcademySection | null;
  certification: CertificationSection | null;
  generatedAt: string;
}

export interface DxSection {
  agents: number;
  retired: number;
  unassessed: number;
  diagnostics: { bound: number; practice: number; total: number };
  meanAai: number | null;
  meanBand: string | null;
  byBand: Array<{ band: string; label: string; tone: string; count: number }>;
  highest: Array<{
    code: string;
    name: string;
    aai: number | null;
    band: string | null;
    status: string;
    lastCommand: string;
  }>;
  needingAttention: number;
}

export interface RxSection {
  total: number;
  withoutPrescription: number;
  mostPrescribed: Array<{ label: string; count: number }>;
  recent: Array<{
    id: string;
    agentName: string;
    aai: number;
    band: string;
    practice: boolean;
    controls: number;
    createdAt: string;
  }>;
}

export interface AcademySection {
  programmes: number;
  publishedVersions: number;
  draftVersions: number;
  cohorts: number;
  archivedCohorts: number;
  candidates: number;
  enrolled: number;
  completed: number;
  lessonsCompleted: number;
  attempts: number;
  passes: number;
  passRate: number | null;
  tracks: Array<{
    id: string;
    code: string;
    title: string;
    level: number;
    visible: boolean;
    published: boolean;
    version: number | null;
    modules: number;
    hiddenModules: number;
    lessons: number;
    assessments: number;
    unlockRules: number;
    unlockPolicy: string;
    grants: number;
  }>;
}

export interface CertificationSection {
  issued: number;
  suspended: number;
  revoked: number;
  waived: number;
  badges: number;
  awarded: number;
  revokedBadges: number;
  byTrack: Array<{ code: string; level: number; issued: number }>;
  recent: Array<{
    id: string;
    serial: string;
    status: string;
    holder: string;
    track: string;
    issuedAt: string;
    waivers: number;
  }>;
}

const BAND_BAR: Record<string, string> = {
  green: "bg-signal-green",
  amber: "bg-signal-amber",
  orange: "bg-signal-amber",
  red: "bg-signal-red",
};

/**
 * The same four bands as fills rather than classes, for marks drawn inline.
 *
 * These are state colours — the AAI bands mean something fixed — so they are
 * never the categorical series palette, and never reused to tell two series
 * apart.
 */
const BAND_FILL: Record<string, string> = {
  green: "var(--color-signal-green)",
  amber: "var(--color-signal-amber)",
  orange: "var(--color-signal-amber)",
  red: "var(--color-signal-red)",
};

/** The risk scale the gauge is drawn on, low to high. */
export const AAI_ARC = [
  { upTo: 25, colour: "var(--color-signal-green)", label: "Lower" },
  { upTo: 50, colour: "var(--color-signal-amber)", label: "Moderate" },
  { upTo: 75, colour: "var(--color-scale-3)", label: "Elevated" },
  { upTo: 100, colour: "var(--color-signal-red)", label: "Critical" },
];

const BAND_TONE: Record<string, "green" | "amber" | "red" | "neutral"> = {
  LOWER: "green",
  MODERATE: "amber",
  ELEVATED: "amber",
  CRITICAL: "red",
};

/** One headline figure, with its own link through to the screen behind it. */
function Tile({
  label,
  value,
  note,
  tone,
  href,
  linkLabel,
}: {
  label: string;
  value: ReactNode;
  note: string;
  tone?: "green" | "amber" | "red" | "neutral";
  href: string;
  linkLabel: string;
}) {
  return (
    <div className="panel flex flex-col justify-between px-4 py-3">
      <div>
        <div className="flex items-baseline justify-between gap-2">
          <p className="rule-label">{label}</p>
          {tone ? (
            <Badge tone={tone}>
              {tone === "green"
                ? "steady"
                : tone === "red"
                  ? "attention"
                  : "watch"}
            </Badge>
          ) : null}
        </div>
        <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
        <p className="mt-0.5 text-xs text-ink-400">{note}</p>
      </div>
      <Link href={href} className="mt-3 text-xs text-brass-500 hover:underline">
        {linkLabel} &rarr;
      </Link>
    </div>
  );
}

/** A row of figures inside a panel. */
function Figures({ items }: { items: Array<[string, ReactNode]> }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt className="rule-label">{label}</dt>
          <dd className="mt-0.5 text-sm font-medium tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function HeadlineTiles({
  overview,
  certificatesHref = "/admin/credentials",
}: {
  overview: InstitutionOverview;
  /** Where the certification tile leads: the register in this portal. */
  certificatesHref?: string;
}) {
  const { dx, rx, academy, certification } = overview;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {dx ? (
        <Tile
          label="AIM Dx"
          value={dx.meanAai === null ? "—" : dx.meanAai}
          note={
            dx.meanAai === null
              ? `${dx.agents} agents, none assessed`
              : `mean AAI across ${dx.agents - dx.unassessed} assessed of ${dx.agents} agents · ${dx.needingAttention} need attention`
          }
          tone={dx.meanBand ? BAND_TONE[dx.meanBand] : undefined}
          href="/governance/registry"
          linkLabel="Registry"
        />
      ) : null}

      {rx ? (
        <Tile
          label="AIM Rx"
          value={rx.total}
          note={`prescriptions written · ${rx.withoutPrescription} diagnostics without one`}
          href="/governance/dx"
          linkLabel="Run a diagnostic"
        />
      ) : null}

      {academy ? (
        <Tile
          label="Academy"
          value={academy.candidates}
          note={`candidates · ${academy.tracks.length} tracks · ${academy.enrolled} active enrolments`}
          href="/authoring"
          linkLabel="Authoring"
        />
      ) : null}

      {certification ? (
        <Tile
          label="Certification"
          value={certification.issued}
          note={
            certification.waived > 0
              ? `credentials live · ${certification.waived} carry a waiver`
              : `credentials live · ${certification.revoked} revoked`
          }
          tone={certification.waived > 0 ? "amber" : undefined}
          href={certificatesHref}
          linkLabel="Certificates"
        />
      ) : null}
    </div>
  );
}

export function DxPanel({ dx }: { dx: DxSection }) {
  const total = dx.byBand.reduce((sum, b) => sum + b.count, 0);

  return (
    <Panel
      title="AIM Dx — the register"
      hint="Every governed agent, and what its last bound diagnostic says about it. Practice runs are counted separately and move nothing."
      action={
        <Badge tone={dx.needingAttention > 0 ? "amber" : "green"}>
          {dx.agents} agents
        </Badge>
      }
    >
      <Figures
        items={[
          ["In the register", dx.agents],
          ["Not yet assessed", dx.unassessed],
          ["Bound diagnostics", dx.diagnostics.bound],
          ["Practice runs", dx.diagnostics.practice],
        ]}
      />

      {total > 0 ? (
        <div className="mt-4">
          <div className="grid gap-4 sm:grid-cols-[auto_1fr] sm:items-center">
            {/* The index means nothing without the scale it sits on: a bare
                65.9 reads as "fine". The gauge carries the bands. */}
            <Gauge
              value={dx.meanAai}
              label="mean AAI across the register"
              bands={AAI_ARC}
              size={176}
            />

            <StackedBar
              title="Exposure across the register"
              hint="Each agent counted once, in the band its last bound diagnostic put it in."
              segments={dx.byBand.map((band) => ({
                label: band.label,
                value: band.count,
                colour: BAND_FILL[band.tone] ?? "var(--color-ink-700)",
              }))}
              empty="No agent has been assessed yet."
            />
          </div>
        </div>
      ) : null}

      {dx.highest.length > 0 ? (
        <ul className="mt-4 space-y-1.5">
          {dx.highest.map((agent) => (
            <li
              key={agent.code}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ink-800 px-3 py-2 text-xs"
            >
              <span className="flex items-center gap-2.5">
                <span className="font-mono text-brass-500">{agent.code}</span>
                <span className="text-ink-300">{agent.name}</span>
              </span>
              <span className="flex items-center gap-2">
                {agent.lastCommand === "MISSING" ? (
                  <Badge tone="red">no last command</Badge>
                ) : null}
                <Badge tone={agent.band ? BAND_TONE[agent.band] : "neutral"}>
                  {agent.band}
                </Badge>
                <span className="w-12 text-right font-mono tabular-nums">
                  {agent.aai}
                </span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>No agent has a bound diagnostic yet.</Empty>
      )}
    </Panel>
  );
}

export function RxPanel({ rx }: { rx: RxSection }) {
  return (
    <Panel
      title="AIM Rx — the control work"
      hint="What the diagnostics led to. A prescription ranks the control changes that would move an agent out of its band."
      action={<Badge>{rx.total} written</Badge>}
    >
      {rx.mostPrescribed.length > 0 ? (
        <>
          <p className="rule-label mb-2">Most often prescribed</p>
          <ul className="space-y-1.5">
            {rx.mostPrescribed.map((control) => (
              <li
                key={control.label}
                className="flex items-center gap-3 text-xs"
              >
                <span className="w-44 shrink-0 truncate text-ink-300">
                  {control.label}
                </span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-900">
                  <span
                    className="block h-full rounded-full bg-brass-500"
                    style={{
                      width: `${(control.count / rx.mostPrescribed[0].count) * 100}%`,
                    }}
                  />
                </span>
                <span className="w-6 text-right font-mono tabular-nums text-ink-400">
                  {control.count}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <Empty>No prescriptions written yet.</Empty>
      )}

      {rx.withoutPrescription > 0 ? (
        <p className="mt-4 rounded-lg border border-ink-800 px-3 py-2 text-xs text-ink-400">
          <span className="font-medium text-ink-200">
            {rx.withoutPrescription}
          </span>{" "}
          diagnostics have no prescription against them. A diagnostic states the
          exposure; the prescription is what anyone does about it.
        </p>
      ) : null}
    </Panel>
  );
}

export function AcademyPanel({ academy }: { academy: AcademySection }) {
  return (
    <Panel
      title="Academy"
      hint="What is built, what is published, and who is moving through it."
      action={
        <Badge tone={academy.draftVersions > 0 ? "amber" : "neutral"}>
          {academy.draftVersions} draft{academy.draftVersions === 1 ? "" : "s"}
        </Badge>
      }
    >
      <Figures
        items={[
          ["Candidates", academy.candidates],
          ["Active enrolments", academy.enrolled],
          ["Lessons completed", academy.lessonsCompleted],
          [
            "Assessment pass rate",
            academy.passRate === null ? "—" : `${academy.passRate}%`,
          ],
        ]}
      />

      {/* How much of each track is actually built. One measure across the
          tracks, so one hue: the comparison is the length, not the colour. */}
      <div className="mt-5">
        <Bars
          title="What each track holds"
          hint="Lessons written against the modules defined on its published version."
          data={academy.tracks.map((track) => ({
            label: track.code,
            note: `${track.modules} modules`,
            value: track.lessons,
            display: `${track.lessons} lesson${track.lessons === 1 ? "" : "s"} · ${track.assessments} papers`,
          }))}
          empty="No track has a published version yet."
        />
      </div>

      <ul className="mt-4 space-y-1.5">
        {academy.tracks.map((track) => (
          <li
            key={track.code}
            className="rounded-lg border border-ink-800 px-3 py-2"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex flex-wrap items-center gap-2.5 text-xs">
                <Badge>LEVEL {track.level}</Badge>
                <span className="font-mono text-brass-500">{track.code}</span>
                <span className="text-ink-300">{track.title}</span>
                {!track.visible ? <Badge tone="amber">hidden</Badge> : null}
                {!track.published ? (
                  <Badge tone="amber">unpublished</Badge>
                ) : null}
              </span>
              <Link
                href={`/authoring/restrictions/${track.id}`}
                className="text-[11px] text-ink-500 hover:text-brass-500"
              >
                {track.unlockRules === 0
                  ? "open to everyone"
                  : `${track.unlockRules} requirement${track.unlockRules === 1 ? "" : "s"} · ${
                      track.unlockPolicy === "ANY" ? "any one" : "all"
                    }`}
                {track.grants > 0 ? ` · ${track.grants} admitted by name` : ""}
              </Link>
            </div>
            <p className="mt-1 font-mono text-[11px] text-ink-500">
              {track.modules} modules
              {track.hiddenModules > 0
                ? ` (${track.hiddenModules} hidden)`
                : ""}{" "}
              · {track.lessons} lessons · {track.assessments} assessments
              {track.version ? ` · v${track.version}` : ""}
            </p>
          </li>
        ))}
      </ul>

      <p className="mt-3 text-[11px] text-ink-500">
        {academy.cohorts} open cohort{academy.cohorts === 1 ? "" : "s"}
        {academy.archivedCohorts > 0
          ? `, ${academy.archivedCohorts} archived`
          : ""}{" "}
        · {academy.publishedVersions} published version
        {academy.publishedVersions === 1 ? "" : "s"}
      </p>
    </Panel>
  );
}

export function CertificationPanel({
  certification,
}: {
  certification: CertificationSection;
}) {
  const c = certification;

  return (
    <Panel
      title="Certification"
      hint="What the institution has put its name to, and on what basis."
      action={
        <Badge
          tone={c.waived > 0 ? "amber" : c.issued > 0 ? "green" : "neutral"}
        >
          {c.issued} live
        </Badge>
      }
    >
      <Figures
        items={[
          // Credentials whose standing is "issued" now, i.e. valid. Named so it
          // cannot be read against the register's "issued in total".
          ["Valid", c.issued],
          ["Suspended", c.suspended],
          ["Revoked", c.revoked],
          ["Badges awarded", c.awarded],
        ]}
      />

      {c.waived > 0 ? (
        <p className="mt-4 rounded-lg border border-signal-amber/30 bg-signal-amber/5 px-3 py-2 text-xs text-ink-300">
          <span className="font-medium text-signal-amber">{c.waived}</span>{" "}
          credential
          {c.waived === 1 ? "" : "s"} carr{c.waived === 1 ? "ies" : "y"} a
          waived requirement. The waiver is stamped on the credential itself and
          names who granted it — a gate cannot be passed quietly.
        </p>
      ) : null}

      {c.byTrack.length > 0 ? (
        <ul className="mt-4 space-y-1.5">
          {c.byTrack.map((track) => (
            <li
              key={track.code}
              className="flex items-center justify-between gap-3 rounded-lg border border-ink-800 px-3 py-2 text-xs"
            >
              <span className="flex items-center gap-2.5">
                <Badge>LEVEL {track.level}</Badge>
                <span className="font-mono text-brass-500">{track.code}</span>
              </span>
              <span className="font-mono tabular-nums text-ink-300">
                {track.issued} issued
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>No credential is currently live.</Empty>
      )}

      <p className="mt-3 text-[11px] text-ink-500">
        {c.badges} active badge{c.badges === 1 ? "" : "s"} defined
        {c.revokedBadges > 0 ? ` · ${c.revokedBadges} award withdrawn` : ""}
      </p>
    </Panel>
  );
}
