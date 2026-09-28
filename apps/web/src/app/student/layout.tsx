import { Shell } from "@/components/shell";
import { requirePortal } from "@/lib/portal";

export default async function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requirePortal("STUDENT");
  return (
    <Shell
      role={session.user.role}
      name={session.user.name}
      email={session.user.email}
      previewRole={session.previewRole ?? null}
    >
      {children}
    </Shell>
  );
}
