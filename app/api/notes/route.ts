import { NextRequest, NextResponse } from "next/server";
import { createNote, listNotesForUser } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const user = getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  return NextResponse.json(listNotesForUser(user.id));
}

export async function POST(req: NextRequest) {
  const user = getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const body = await req.json();
  const content = typeof body.content === "string" ? body.content.trim() : "";
  const threadId = typeof body.threadId === "string" ? body.threadId : "";
  if (!content) {
    return NextResponse.json({ error: "content is required" }, { status: 400 });
  }
  if (!threadId) {
    return NextResponse.json({ error: "threadId is required" }, { status: 400 });
  }
  const note = createNote(content, threadId, user.id);
  if (!note) {
    return NextResponse.json({ error: "invalid thread" }, { status: 400 });
  }
  return NextResponse.json(note, { status: 201 });
}
