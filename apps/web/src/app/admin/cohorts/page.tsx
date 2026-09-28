import { CohortList } from "@/components/cohort-list";

export default async function AdminCohortsPage() {
  return <CohortList basePath="/admin/cohorts" />;
}
