import { NextRequest, NextResponse } from "next/server";
import { listTrashedThreads } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const user = getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  return NextResponse.json(listTrashedThreads(user.id));
}
