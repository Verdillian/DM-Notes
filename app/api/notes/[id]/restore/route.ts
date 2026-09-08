import { NextRequest, NextResponse } from "next/server";
import { restoreNote } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { id } = await params;
  const note = restoreNote(id, user.id);
  if (!note) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json(note);
}
