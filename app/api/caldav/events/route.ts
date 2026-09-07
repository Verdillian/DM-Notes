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

  const { searchParams } = new URL(req.url);
  const startParam = searchParams.get("start");
  const endParam = searchParams.get("end");

  const now = new Date();
  const start = startParam ? new Date(startParam) : new Date(now.setDate(now.getDate() - 7));
  const end = endParam ? new Date(endParam) : new Date(new Date().setDate(new Date().getDate() + 60));

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return NextResponse.json({ error: "Invalid start/end date" }, { status: 400 });
  }
  if (end.getTime() - start.getTime() > 1000 * 60 * 60 * 24 * 400) {
    return NextResponse.json({ error: "Date range too large" }, { status: 400 });
  }

  try {
    const events = await fetchCalendarEvents(conn, start, end);
    return NextResponse.json(events);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't load calendar events.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
