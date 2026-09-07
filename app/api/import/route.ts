import { NextRequest, NextResponse } from "next/server";
import { importThread, importNote } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

type RawThread = { id?: unknown; name?: unknown; createdAt?: unknown };
type RawNote = {
  content?: unknown;
  threadId?: unknown;
  starred?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
};

export async function POST(req: NextRequest) {
  const user = getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  let data: unknown;
  try {
    data = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const threadsRaw = (data as { threads?: unknown })?.threads;
  const notesRaw = (data as { notes?: unknown })?.notes;
  if (!Array.isArray(threadsRaw) || !Array.isArray(notesRaw)) {
    return NextResponse.json(
      { error: "file doesn't look like a notes backup" },
      { status: 400 }
    );
  }

  const idMap = new Map<string, string>();
  let threadsImported = 0;
  for (const raw of threadsRaw as RawThread[]) {
    if (typeof raw?.id !== "string" || typeof raw?.name !== "string") continue;
    const createdAt = typeof raw.createdAt === "number" ? raw.createdAt : Date.now();
    const created = importThread(raw.name, user.id, createdAt);
    idMap.set(raw.id, created.id);
    threadsImported++;
  }

  let notesImported = 0;
  for (const raw of notesRaw as RawNote[]) {
    if (typeof raw?.content !== "string" || typeof raw?.threadId !== "string") continue;
    const mappedThreadId = idMap.get(raw.threadId);
    if (!mappedThreadId) continue;
    const createdAt = typeof raw.createdAt === "number" ? raw.createdAt : Date.now();
    const updatedAt = typeof raw.updatedAt === "number" ? raw.updatedAt : createdAt;
    importNote(raw.content, mappedThreadId, !!raw.starred, createdAt, updatedAt);
    notesImported++;
  }

  return NextResponse.json({ threadsImported, notesImported });
}
