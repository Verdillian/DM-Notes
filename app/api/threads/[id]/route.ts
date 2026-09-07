import { NextRequest, NextResponse } from "next/server";
import { deleteThread, listThreads, renameThread } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { id } = await params;
  const body = await req.json();
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  const thread = renameThread(id, name, user.id);
  if (!thread) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json(thread);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { id } = await params;
  if (listThreads(user.id).length <= 1) {
    return NextResponse.json(
      { error: "cannot delete the last remaining thread" },
      { status: 400 }
    );
  }
  const ok = deleteThread(id, user.id);
  if (!ok) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
