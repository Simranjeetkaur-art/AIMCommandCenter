import { redirect } from "next/navigation";

/**
 * Security is the only thing the account area holds, so /account is not a
 * landing page with one card on it. It is the door to that screen.
 */
export default function AccountPage() {
  redirect("/account/security");
}
