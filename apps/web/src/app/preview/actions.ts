"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { PORTAL_HOME, type Role } from "@aim/contracts";
import { setPreviewHint } from "@/lib/session";
import { act } from "@/lib/act";

/**
 * Look at another role's screens.
 *
 * The preview is written onto the session by the API; the cookie set here only
 * tells middleware which portal to route to. Getting them out of step cannot
 * grant anything: the API narrows permissions and refuses writes from the
 * session row, whatever the cookie says.
 */
export async function startPreview(formData: FormData) {
  const role = String(formData.get("role") ?? "") as Role;
  await act("/auth/preview", { method: "POST", body: { role } });
  await setPreviewHint(role);
  redirect(PORTAL_HOME[role] ?? "/");
}

export async function endPreview(formData: FormData) {
  await act("/auth/preview/end", { method: "POST" });
  await setPreviewHint(null);

  const back = String(formData.get("back") ?? "");
  revalidatePath("/", "layout");
  redirect(back || "/");
}
