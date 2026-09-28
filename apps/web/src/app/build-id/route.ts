import { NextResponse } from "next/server";
import { BUILD_ID } from "@/lib/build-id";

/**
 * Which build is serving right now. Public, unauthenticated and uncacheable:
 * it is a token, it says nothing about the institution, and a reader whose
 * session has expired still deserves to be told their tab is stale.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    { id: BUILD_ID },
    { headers: { "cache-control": "no-store" } },
  );
}
