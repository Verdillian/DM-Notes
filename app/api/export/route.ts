import { NextRequest, NextResponse } from "next/server";
import { listThreads, listNotesForUser } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const user = getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const threads = listThreads(user.id);
  const notes = listNotesForUser(user.id);

  const payload = {
    version: 1,
    exportedAt: Date.now(),
    threads: threads.map((t) => ({ id: t.id, name: t.name, createdAt: t.createdAt })),
    notes: notes.map((n) => ({
      id: n.id,
      content: n.content,
      starred: n.starred,
      threadId: n.threadId,
      createdAt: n.createdAt,
      updatedAt: n.updatedAt,
    })),
  };

  const filename = `notes-backup-${new Date().toISOString().slice(0, 10)}.json`;
  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
