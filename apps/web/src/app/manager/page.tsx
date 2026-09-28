import { apiOrNull } from "@/lib/api";
import { Empty, Panel, Refused, Stat } from "@/components/ui";
import { Bars, Meter, StackedBar } from "@/components/charts";
import {
  AcademyPanel,
  DxPanel,
  HeadlineTiles,
  RxPanel,
  type InstitutionOverview,
} from "@/components/overview-tiles";

interface ProgressRow {
  cohortId: string;
  code: string;
  title: string;
  programme: { code: string; title: string };
  active: number;
  withdrawn: number;
  approvedSubmissions: number;
  pendingSubmissions: number;
  credentialsIssued: number;
}

interface Turnaround {
  openCount: number;
  overdueCount: number;
  unclaimedCount: number;
  slaHours: number;
}

export default async function ManagerOverview() {
  // The same overview the administrator gets, minus the sections a manager
  // does not hold. Certification comes back null: a manager builds the academy
  // and does not control what the institution puts its name to.
  const [overview, progress, turnaround] = await Promise.all([
    apiOrNull<InstitutionOverview>("/reports/overview"),
    apiOrNull<ProgressRow[]>("/reports/progress"),
    apiOrNull<Turnaround>("/reports/turnaround"),
  ]);

  return (
    <div className="space-y-6">
      {overview ? <HeadlineTiles
          overview={overview}
          certificatesHref="/manager/credentials"
        /> : null}

      <div className="grid gap-6 lg:grid-cols-2">
        {overview?.academy ? <AcademyPanel academy={overview.academy} /> : null}
        {overview?.dx ? <DxPanel dx={overview.dx} /> : null}
        {overview?.rx ? <RxPanel rx={overview.rx} /> : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Cohorts running" value={progress?.length ?? 0} />
        <Stat label="Reviews open" value={turnaround?.openCount ?? 0} />
        <Stat
          label="Overdue"
          value={turnaround?.overdueCount ?? 0}
          note={`${turnaround?.slaHours ?? 72}h turnaround`}
        />
        <Stat label="Unclaimed" value={turnaround?.unclaimedCount ?? 0} />
      </div>

      {progress && progress.length > 0 ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title="Where each cohort has got to" hint="">
            {/* One measure across several rows, so one hue and no legend:
                colour carries no identity here. */}
            <Bars
              title="Work approved, per cohort"
              hint="Approved submissions against everything submitted on that cohort."
              data={progress.map((row) => {
                const submitted =
                  row.approvedSubmissions + row.pendingSubmissions;
                return {
                  label: row.code,
                  note: row.programme.code,
                  value:
                    submitted === 0
                      ? 0
                      : (row.approvedSubmissions / submitted) * 100,
                  display:
                    submitted === 0
                      ? "nothing submitted"
                      : `${Math.round((row.approvedSubmissions / submitted) * 100)}% · ${row.approvedSubmissions}/${submitted}`,
                };
              })}
              max={100}
              empty="No work has been submitted on any cohort yet."
            />
            {/* No table view attached here: the full figures are the panel
                directly below, so a second copy would be noise. */}
          </Panel>

          <Panel title="Who is on the roll" hint="">
            <StackedBar
              title="Enrolments across every cohort"
              hint="Active, withdrawn, and those who finished."
              segments={[
                {
                  label: "Active",
                  value: progress.reduce((n, r) => n + r.active, 0),
                  tone: "good",
                },
                {
                  label: "Withdrawn",
                  value: progress.reduce((n, r) => n + r.withdrawn, 0),
                  tone: "neutral",
                },
                {
                  label: "Credentialled",
                  value: progress.reduce((n, r) => n + r.credentialsIssued, 0),
                  colour: "var(--color-series-1)",
                },
              ]}
              empty="Nobody is enrolled yet."
            />

            {turnaround ? (
              <div className="mt-5">
                <Meter
                  title="Reviews past the turnaround target"
                  hint={`Open reviews older than ${turnaround.slaHours} hours. A manager reassigns; they never mark.`}
                  value={turnaround.overdueCount}
                  of={Math.max(turnaround.openCount, turnaround.overdueCount)}
                  tone={turnaround.overdueCount > 0 ? "warning" : "good"}
                />
              </div>
            ) : null}
          </Panel>
        </div>
      ) : null}

      <Panel
        title="Cohort progress"
        hint="Every learner on every cohort. A manager sees the whole roll and judges none of it."
      >
        {!progress ? (
          <Refused what="the progress report" />
        ) : progress.length === 0 ? (
          <Empty>No cohorts yet.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="rule-label">
                <tr className="border-b border-ink-800">
                  <th className="py-2 pr-4 font-normal">Cohort</th>
                  <th className="py-2 pr-4 font-normal">Programme</th>
                  <th className="py-2 pr-4 text-right font-normal">Active</th>
                  <th className="py-2 pr-4 text-right font-normal">
                    Withdrawn
                  </th>
                  <th className="py-2 pr-4 text-right font-normal">Approved</th>
                  <th className="py-2 pr-4 text-right font-normal">Pending</th>
                  <th className="py-2 text-right font-normal">Credentials</th>
                </tr>
              </thead>
              <tbody>
                {progress.map((row) => (
                  <tr key={row.cohortId} className="border-b border-ink-800/60">
                    <td className="py-2.5 pr-4">
                      <span className="font-mono text-brass-500">
                        {row.code}
                      </span>
                      <span className="ml-2 text-ink-400">{row.title}</span>
                    </td>
                    <td className="py-2.5 pr-4 font-mono text-ink-400">
                      {row.programme.code}
                    </td>
                    <td className="py-2.5 pr-4 text-right tabular-nums">
                      {row.active}
                    </td>
                    <td className="py-2.5 pr-4 text-right tabular-nums text-ink-400">
                      {row.withdrawn}
                    </td>
                    <td className="py-2.5 pr-4 text-right tabular-nums">
                      {row.approvedSubmissions}
                    </td>
                    <td className="py-2.5 pr-4 text-right tabular-nums">
                      {row.pendingSubmissions}
                    </td>
                    <td className="py-2.5 text-right tabular-nums">
                      {row.credentialsIssued}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
