import { StaffGradebook } from "@/components/staff-gradebook";

export default async function ManagerGradesPage({
  searchParams,
}: {
  searchParams: Promise<{ version?: string; learner?: string }>;
}) {
  const search = await searchParams;
  return <StaffGradebook basePath="/manager/grades" search={search} />;
}
