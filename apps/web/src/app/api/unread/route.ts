import { NextResponse } from "next/server";
import { apiOrNull } from "@/lib/api";

/**
 * Unread counts for the header bell.
 *
 * A proxy rather than a direct call from the browser, for the reason the rest
 * of this app is built that way: the session token is held server-side and
 * the browser never learns where the API is or how to call it.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const counts = await apiOrNull<{ messages: number; notices: number }>(
    "/messages/unread",
  );
  return NextResponse.json(counts ?? { messages: 0, notices: 0 }, {
    headers: { "cache-control": "no-store" },
  });
}
