import { CohortRoll } from "@/components/cohort-roll";

export default async function ManagerCohortRollPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CohortRoll id={id} basePath="/manager/cohorts" />;
}
