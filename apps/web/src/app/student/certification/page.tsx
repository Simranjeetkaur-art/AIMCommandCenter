import Link from "next/link";
import { api } from "@/lib/api";
import { BadgeMark } from "@/components/badge-mark";
import { Badge, Empty, Panel, Stat } from "@/components/ui";

interface Requirement {
  key: string;
  ordinal: number;
  optional: boolean;
  label: string;
  note: string;
  tracked: boolean;
  met: boolean;
  detail: string;
}

interface Track {
  programme: { id: string; code: string; title: string; level: number };
  versionId: string;
  version: number;
  cohort: { code: string; title: string };
  enrollmentStatus: string;
  enrolledAt: string;
  requirements: Requirement[];
  metCount: number;
  trackedCount: number;
  credential: {
    id: string;
    serial: string;
    status: string;
    issuedAt: string;
  } | null;
  badges: Array<{
    id: string;
    code: string;
    title: string;
    iconSvg: string | null;
    iconText: string | null;
    tone: string;
    awardedAt: string;
  }>;
}

interface Standing {
  candidate: { id: string; name: string };
  tracks: Track[];
}

export default async function CertificationCenterPage() {
  const standing = await api<Standing>("/certification/standing");

  return (
    <div className="space-y-6">
      <div>
        <p className="rule-label">Certification Center</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          {standing.candidate.name}
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-400">
          Demonstrate that you can govern AI authority in practice. Work
          through every lesson, pass each module&rsquo;s quiz, then sit the
          final examination &mdash; passing it issues your certificate
          automatically, with a serial number anyone can verify. The simulator
          is practice for those papers, and the examiner-marked work is
          offered alongside them.
        </p>
      </div>

      {standing.tracks.length === 0 ? (
        <Empty>
          You are not enrolled on a track yet. A programme manager enrols
          candidates onto a cohort.
        </Empty>
      ) : (
        standing.tracks.map((track) => (
          <TrackSection key={track.versionId} track={track} />
        ))
      )}
    </div>
  );
}

function TrackSection({ track }: { track: Track }) {
  const percent =
    track.trackedCount === 0
      ? 0
      : Math.round((track.metCount / track.trackedCount) * 100);
  const complete =
    track.trackedCount > 0 && track.metCount === track.trackedCount;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 border-t border-ink-800 pt-5">
        <div>
          <p className="rule-label">
            {track.programme.code} &middot; version {track.version}
          </p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight">
            {track.programme.title}
          </h2>
          <p className="mt-0.5 text-xs text-ink-500">
            {track.cohort.code} {track.cohort.title} &middot; enrolled{" "}
            {new Date(track.enrolledAt).toLocaleDateString()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            tone={track.enrollmentStatus === "ACTIVE" ? "green" : "neutral"}
          >
            {track.enrollmentStatus}
          </Badge>
          {track.credential ? (
            <Badge
              tone={track.credential.status === "ISSUED" ? "green" : "amber"}
            >
              {track.credential.status}
            </Badge>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat
          label="Requirements met"
          value={`${track.metCount} / ${track.trackedCount}`}
          note={
            complete
              ? "Every requirement met"
              : "Counts only what the certificate turns on"
          }
        />
        <Stat label="Badges earned" value={track.badges.length} />
        <Stat
          label="Credential"
          value={track.credential ? track.credential.status : "—"}
          note={
            track.credential
              ? `Issued ${new Date(track.credential.issuedAt).toLocaleDateString()}`
              : "Not yet issued"
          }
        />
      </div>

      <Panel
        title="What the certificate takes"
        hint="Complete every lesson, pass every module quiz, then pass the final examination — which issues the certificate. Practice and the optional extras are listed after those, and never hold it up."
        action={
          <span className="font-mono text-xs text-brass-500">{percent}%</span>
        }
      >
        <div className="mb-4 h-1.5 w-full overflow-hidden rounded-full bg-ink-900">
          <div
            className="h-full rounded-full bg-brass-500 transition-all"
            style={{ width: `${percent}%` }}
          />
        </div>

        <ol className="space-y-2">
          {track.requirements.map((requirement) => (
            <li
              key={requirement.key}
              className={`flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3 ${
                requirement.met
                  ? "border-signal-green/40 bg-signal-green/5"
                  : !requirement.tracked
                    ? "border-dashed border-ink-800 opacity-60"
                    : requirement.optional
                      ? "border-dashed border-ink-800"
                      : "border-ink-800"
              }`}
            >
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border font-mono text-xs ${
                  requirement.met
                    ? "border-signal-green/50 text-signal-green"
                    : "border-ink-700 text-ink-400"
                }`}
              >
                {requirement.met ? "✓" : requirement.ordinal}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  {requirement.label}
                  {requirement.optional ? (
                    <Badge>Does not affect the certificate</Badge>
                  ) : null}
                </span>
                <span className="mt-0.5 block text-xs text-ink-400">
                  {requirement.note}
                </span>
              </span>
              <Badge
                tone={
                  requirement.met
                    ? "green"
                    : requirement.tracked
                      ? "neutral"
                      : "neutral"
                }
              >
                {requirement.detail}
              </Badge>
            </li>
          ))}
        </ol>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="Credential"
          hint="The certificate, and the reference anyone can check it by."
        >
          {track.credential ? (
            <div className="space-y-3">
              <dl className="flex flex-wrap gap-x-8 gap-y-2 text-xs">
                <div>
                  <dt className="rule-label">Serial</dt>
                  <dd className="mt-0.5 font-mono text-brass-500">
                    {track.credential.serial}
                  </dd>
                </div>
                <div>
                  <dt className="rule-label">Issued</dt>
                  <dd className="mt-0.5">
                    {new Date(track.credential.issuedAt).toLocaleDateString()}
                  </dd>
                </div>
                <div>
                  <dt className="rule-label">Standing</dt>
                  <dd className="mt-0.5">{track.credential.status}</dd>
                </div>
              </dl>
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/student/credentials/${track.credential.id}`}
                  className="rounded-lg border border-ink-700 bg-ink-800 px-3 py-1.5 text-xs text-ink-100 transition hover:border-brass-500 hover:text-brass-500"
                >
                  View certificate
                </Link>
                <span className="text-[11px] text-ink-500">
                  Verify at{" "}
                  <a
                    href={`/verify/${track.credential.serial}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-brass-500 hover:underline"
                  >
                    /verify/{track.credential.serial}
                  </a>
                </span>
              </div>
            </div>
          ) : (
            <Empty>
              {complete
                ? "Every requirement is met. Your certificate is on its way."
                : "The certificate is issued automatically the moment you pass the final examination."}
            </Empty>
          )}
        </Panel>

        <Panel title="Digital badges" hint="Earned by clearing a condition.">
          {track.badges.length === 0 ? (
            <Empty>No badge earned on this track yet.</Empty>
          ) : (
            <ul className="flex flex-wrap gap-4">
              {track.badges.map((badge) => (
                <li key={badge.id} className="w-24 text-center">
                  <div className="flex justify-center">
                    <BadgeMark
                      iconSvg={badge.iconSvg}
                      iconText={badge.iconText}
                      tone={badge.tone}
                      title={badge.title}
                    />
                  </div>
                  <p className="mt-1.5 text-[11px] leading-tight">
                    {badge.title}
                  </p>
                  <p className="mt-0.5 font-mono text-[10px] text-ink-500">
                    {new Date(badge.awardedAt).toLocaleDateString()}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </section>
  );
}
