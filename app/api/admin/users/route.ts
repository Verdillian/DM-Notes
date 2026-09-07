import { NextRequest, NextResponse } from "next/server";
import { listUsers } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const user = getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  return NextResponse.json(listUsers());
}
