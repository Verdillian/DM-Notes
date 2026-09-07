import { NextRequest, NextResponse } from "next/server";
import { getCaldavConnection } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { fetchCalendarEvents } from "@/lib/caldav";

export async function GET(req: NextRequest) {
  const user = getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const conn = getCaldavConnection(user.id);
  if (!conn) {
    return NextResponse.json({ error: "No calendar connected yet" }, { status: 400 });
  }

  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - 7);
  const end = new Date(now);
  end.setDate(end.getDate() + 60);

  try {
    const events = await fetchCalendarEvents(conn, start, end);
    return NextResponse.json(events);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't load calendar events.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
