import { StaffGradebook } from "@/components/staff-gradebook";

export default async function AdminGradesPage({
  searchParams,
}: {
  searchParams: Promise<{ version?: string; learner?: string }>;
}) {
  const search = await searchParams;
  return <StaffGradebook basePath="/admin/grades" search={search} />;
}
