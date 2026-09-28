import { CredentialRegister } from "@/components/credential-register";

/** The register, read-only: a manager checks certificates, an administrator changes them. */
export default async function ManagerCredentialsPage({
  searchParams,
}: {
  searchParams: Promise<{ serial?: string; q?: string; status?: string }>;
}) {
  const search = await searchParams;
  return <CredentialRegister basePath="/manager/credentials" search={search} />;
}
