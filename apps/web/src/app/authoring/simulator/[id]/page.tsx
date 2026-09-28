import Link from "next/link";
import { api, apiOrNotFound } from "@/lib/api";
import { Badge } from "@/components/ui";
import { PreviewRun, type PreviewMission } from "./preview-run";

interface Preview {
  id: string;
  code: string;
  title: string;
  passMark: number;
  poolSize: number;
  perRun: number;
  programme: { code: string; title: string };
  version: number;
  versionStatus: string;
  missions: PreviewMission[];
}

/**
 * The author's simulator preview.
 *
 * Plays a run the way a candidate meets it -- a random draw of the run's
 * length, one mission at a time, the debrief after each decision -- and keeps
 * the whole pool one switch away for checking every mission's key. Nothing is
 * recorded: no attempt, no score, no badge.
 */
export default async function SimulatorPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sim = await apiOrNotFound<Preview>(`/simulator/${id}/preview`);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="rule-label">
            Simulator preview &middot; {sim.programme.code} v{sim.version}
          </p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">
            {sim.title}
          </h1>
          <p className="mt-1 text-xs text-ink-400">
            <span className="font-mono">{sim.code}</span> &middot;{" "}
            {sim.perRun} missions per run from a pool of {sim.poolSize}{" "}
            &middot; pass {sim.passMark}%
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone="blue">Preview — nothing is recorded</Badge>
          <Badge tone={sim.versionStatus === "PUBLISHED" ? "green" : "amber"}>
            {sim.versionStatus}
          </Badge>
        </div>
      </div>

      <PreviewRun
        missions={sim.missions}
        perRun={sim.perRun}
        passMark={sim.passMark}
      />

      <div className="flex flex-wrap gap-4 text-xs">
        <Link
          href="/authoring?view=simulator"
          className="text-ink-400 hover:text-ink-200"
        >
          &larr; All simulators
        </Link>
        <Link
          href={`/authoring/assessments/${sim.id}`}
          className="text-brass-500 hover:underline"
        >
          Edit missions &amp; run length
        </Link>
      </div>
    </div>
  );
}
