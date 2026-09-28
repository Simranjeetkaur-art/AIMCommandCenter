import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { PERMISSIONS as P } from "@aim/contracts";
import { api } from "@/lib/api";
import { Panel, buttonClass } from "@/components/ui";
import { requirePermission } from "@/lib/portal";
import { ScoreForm } from "./form";
import type { PerformanceReview } from "@/components/performance";
import { act } from "@/lib/act";

interface Subjects {
  reviewsRole: string | null;
  dimensions: Array<{ key: string; name: string; description: string }>;
  people: Array<{ id: string; name: string; email: string; role: string }>;
}

/** "2026-Q3" for today, so the common case needs no typing. */
function currentCycle(): string {
  const now = new Date();
  return `${now.getFullYear()}-Q${Math.floor(now.getMonth() / 3) + 1}`;
}

export default async function WriteReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ subjectId: string }>;
  searchParams: Promise<{ cycle?: string }>;
}) {
  const { subjectId } = await params;
  const sp = await searchParams;
  await requirePermission(P.PERFORMANCE_WRITE);

  const subjects = await api<Subjects>("/performance/subjects");
  const person = subjects.people.find((p) => p.id === subjectId);

  // Not one of theirs. The API would refuse anyway; this turns a 404 into a
  // sentence rather than an error page.
  if (!person) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold tracking-tight">
          Not someone you assess
        </h1>
        <p className="max-w-xl text-xs text-ink-400">
          You assess {subjects.reviewsRole ?? "nobody"}, and only those assigned
          to you. If this person should be yours, that is an assignment to make
          on the cohort roll first.
        </p>
        <Link
          href="/performance"
          className="inline-block rounded-lg border border-ink-700 px-3 py-1.5 text-xs transition hover:border-brass-500"
        >
          Back to performance
        </Link>
      </div>
    );
  }

  const cycle = sp.cycle ?? currentCycle();

  // An existing draft for this cycle, so the form opens where it was left.
  const mine = await api<PerformanceReview[]>(
    `/performance?subjectId=${subjectId}&cycle=${encodeURIComponent(cycle)}`,
  );
  const existing = mine.find((r) => r.viewer.isReviewer) ?? null;

  async function save(formData: FormData) {
    "use server";
    const scores = subjects.dimensions.map((dimension) =>
      Number(formData.get(`score-${dimension.key}`) ?? 3),
    );

    const saved = await act<{ id: string }>("/performance", {
      method: "PUT",
      body: {
        subjectId,
        cycle: String(formData.get("cycle") ?? cycle),
        scores,
        strengths: String(formData.get("strengths") ?? ""),
        concerns: String(formData.get("concerns") ?? ""),
        actions: String(formData.get("actions") ?? ""),
      },
    });

    revalidatePath("/performance");
    redirect(`/performance/${saved.id}`);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="rule-label">
            Assessing a {person.role.toLowerCase()} &middot; {cycle}
          </p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">
            {person.name}
          </h1>
          <p className="mt-1 font-mono text-xs text-ink-500">{person.email}</p>
        </div>
        <Link href="/performance" className={buttonClass("secondary", "md")}>
          Back
        </Link>
      </div>

      <Panel
        title={existing ? "Editing your draft" : "New assessment"}
        hint="Saved as a draft. They see nothing until you release it, and the index is computed from your scores rather than typed."
      >
        <ScoreForm
          action={save}
          dimensions={subjects.dimensions}
          cycle={cycle}
          initial={
            existing
              ? {
                  scores: existing.dimensions.map((d) => d.score ?? 3),
                  strengths: existing.strengths,
                  concerns: existing.concerns,
                  actions: existing.actions,
                }
              : null
          }
        />
      </Panel>
    </div>
  );
}
