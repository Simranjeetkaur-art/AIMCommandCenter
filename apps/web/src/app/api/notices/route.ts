import { NextResponse } from "next/server";
import { apiOrNull } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  const notices = await apiOrNull<{ items: unknown[]; unread: number }>(
    "/notifications?limit=20",
  );
  return NextResponse.json(notices ?? { items: [], unread: 0 }, {
    headers: { "cache-control": "no-store" },
  });
}
