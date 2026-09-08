import { NextRequest, NextResponse } from "next/server";
import { reorderThreads } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export async function PATCH(req: NextRequest) {
  const user = getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = await req.json();
  const threadIds = Array.isArray(body.threadIds)
    ? body.threadIds.filter((id: unknown): id is string => typeof id === "string")
    : null;
  if (!threadIds || threadIds.length !== body.threadIds?.length) {
    return NextResponse.json({ error: "threadIds must be an array of strings" }, { status: 400 });
  }

  const ok = reorderThreads(user.id, threadIds);
  if (!ok) {
    return NextResponse.json(
      { error: "threadIds must exactly match your current threads" },
      { status: 400 }
    );
  }
  return NextResponse.json({ ok: true });
}
