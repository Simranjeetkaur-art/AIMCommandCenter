"use server";

import { revalidatePath } from "next/cache";
import { act, done } from "@/lib/act";

/**
 * Granting or declining a learner's request for more attempts.
 *
 * The note is required either way and goes to the learner; it travels as
 * `reason` so the audit record keeps it.
 */
export async function decideAttemptRequest(formData: FormData) {
  const requestId = String(formData.get("requestId") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const extraAttempts = Number(formData.get("extraAttempts") ?? 1);
  const learner = String(formData.get("learner") ?? "the learner");

  await act(`/assessments/attempt-requests/${requestId}/decide`, {
    method: "POST",
    body: {
      decision,
      extraAttempts,
      reason: String(formData.get("reason") ?? ""),
    },
  });

  revalidatePath("/instructor");
  revalidatePath("/manager/turnaround");
  revalidatePath("/admin");
  await done(
    decision === "GRANT"
      ? `Granted ${extraAttempts} more attempt${extraAttempts === 1 ? "" : "s"} to ${learner}. They have been told.`
      : `Declined ${learner}'s request. They have been told, with your note.`,
  );
}
