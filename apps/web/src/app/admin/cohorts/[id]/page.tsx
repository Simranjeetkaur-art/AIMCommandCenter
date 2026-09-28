import { CohortRoll } from "@/components/cohort-roll";

export default async function AdminCohortRollPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CohortRoll id={id} basePath="/admin/cohorts" />;
}
