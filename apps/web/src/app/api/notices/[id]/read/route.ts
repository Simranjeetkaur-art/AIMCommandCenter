import { NextResponse } from "next/server";
import { apiOrNull } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const result = await apiOrNull(`/notifications/${id}/read`, {
    method: "POST",
  });
  return NextResponse.json(result ?? { marked: 0 });
}
