import { NextRequest, NextResponse } from "next/server";
import { getCaldavConnection } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { discoverCalendars } from "@/lib/caldav";

export async function GET(req: NextRequest) {
  const user = getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const conn = getCaldavConnection(user.id);
  if (!conn) {
    return NextResponse.json({ error: "No calendar connected yet" }, { status: 400 });
  }

  try {
    const calendars = await discoverCalendars(conn);
    return NextResponse.json(calendars);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't list calendars.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
