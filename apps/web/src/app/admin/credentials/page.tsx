import { revalidatePath } from "next/cache";
import { CredentialRegister } from "@/components/credential-register";
import { act } from "@/lib/act";

export default async function AdminCredentialsPage({
  searchParams,
}: {
  searchParams: Promise<{ serial?: string; q?: string; status?: string }>;
}) {
  const search = await searchParams;

  async function changeStanding(formData: FormData) {
    "use server";
    const id = String(formData.get("credentialId"));
    const action = String(formData.get("action"));
    await act(`/credentials/${id}/${action}`, {
      method: "POST",
      body: { reason: String(formData.get("reason") ?? "") },
    });
    revalidatePath("/admin/credentials");
  }

  return (
    <CredentialRegister
      basePath="/admin/credentials"
      search={search}
      act={changeStanding}
    />
  );
}
