import Link from "next/link";
import { api } from "@/lib/api";
import { buttonClass } from "@/components/ui";
import { NoGrades, TrackGradeCard, type TrackGrades } from "@/components/gradebook";

/** The candidate's own marks. Their record, and nobody else's. */
export default async function StudentGradesPage() {
  const { tracks } = await api<{ tracks: TrackGrades[] }>("/gradebook/mine");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="rule-label">Your record</p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">
            Grade book
          </h1>
          <p className="mt-1 max-w-3xl text-xs text-ink-400">
            Every mark on your record, grouped by what it decides. The module
            quizzes and the final examination earn the certificate; the
            simulator is practice and is never counted.
          </p>
        </div>
        <Link href="/student/academy" className={buttonClass("secondary", "md")}>
          Back to the Academy
        </Link>
      </div>

      {tracks.length === 0 ? (
        <NoGrades href="/student/academy" />
      ) : (
        tracks.map((grades) => (
          <TrackGradeCard
            key={grades.version.id}
            grades={grades}
            learnerLinks
          />
        ))
      )}
    </div>
  );
}
