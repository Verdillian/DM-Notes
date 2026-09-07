import { NextRequest, NextResponse } from "next/server";
import { deleteNote, updateNote } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { id } = await params;
  const body = await req.json();
  const updates: { content?: string; starred?: boolean; threadId?: string } = {};
  if (typeof body.content === "string") updates.content = body.content;
  if (typeof body.starred === "boolean") updates.starred = body.starred;
  if (typeof body.threadId === "string") updates.threadId = body.threadId;

  const note = updateNote(id, updates, user.id);
  if (!note) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json(note);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { id } = await params;
  const ok = deleteNote(id, user.id);
  if (!ok) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
