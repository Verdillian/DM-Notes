import { NextRequest, NextResponse } from "next/server";
import { getCaldavConnection } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import {
  applyEventEdits,
  createEvent,
  fetchCalendarEvents,
  fetchEventRaw,
  saveEvent,
} from "@/lib/caldav";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

// an event/calendar URL must live on the same server we're connected to, so
// a client can't trick us into making an authenticated request elsewhere
function sameOrigin(url: string, connUrl: string): boolean {
  try {
    return new URL(url).origin === new URL(connUrl).origin;
  } catch {
    return false;
  }
}

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

export async function POST(req: NextRequest) {
  const user = getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const conn = getCaldavConnection(user.id);
  if (!conn) {
    return NextResponse.json({ error: "No calendar connected yet" }, { status: 400 });
  }

  const ip = getClientIp(req);
  if (!checkRateLimit(`caldav-create:${user.id}:${ip}`, 30, 15 * 60 * 1000)) {
    return NextResponse.json(
      { error: "Too many attempts. Try again in a few minutes." },
      { status: 429 }
    );
  }

  const body = await req.json();
  const calendarUrl = typeof body.calendarUrl === "string" ? body.calendarUrl : "";
  const summary = typeof body.summary === "string" ? body.summary.trim() : "";
  const location = typeof body.location === "string" ? body.location : undefined;
  const start = typeof body.start === "string" ? new Date(body.start) : undefined;
  const end = typeof body.end === "string" ? new Date(body.end) : undefined;
  const allDay = !!body.allDay;

  if (!calendarUrl || !sameOrigin(calendarUrl, conn.url)) {
    return NextResponse.json({ error: "Invalid calendar reference" }, { status: 400 });
  }
  if (!summary) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }
  if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return NextResponse.json({ error: "A valid start and end are required" }, { status: 400 });
  }

  try {
    await createEvent(calendarUrl, conn, { summary, location, start, end, allDay });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't create that event.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function PATCH(req: NextRequest) {
  const user = getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const conn = getCaldavConnection(user.id);
  if (!conn) {
    return NextResponse.json({ error: "No calendar connected yet" }, { status: 400 });
  }

  const ip = getClientIp(req);
  if (!checkRateLimit(`caldav-edit:${user.id}:${ip}`, 30, 15 * 60 * 1000)) {
    return NextResponse.json(
      { error: "Too many attempts. Try again in a few minutes." },
      { status: 429 }
    );
  }

  const body = await req.json();
  const href = typeof body.href === "string" ? body.href : "";
  if (!href || !sameOrigin(href, conn.url)) {
    return NextResponse.json({ error: "That event isn't on your connected server" }, { status: 400 });
  }

  const summary = typeof body.summary === "string" ? body.summary : undefined;
  const location = typeof body.location === "string" ? body.location : undefined;
  const start = typeof body.start === "string" ? new Date(body.start) : undefined;
  const end = typeof body.end === "string" ? new Date(body.end) : undefined;
  const allDay = !!body.allDay;

  if ((start && Number.isNaN(start.getTime())) || (end && Number.isNaN(end.getTime()))) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }

  try {
    const { raw, etag } = await fetchEventRaw(href, conn);
    const updated = applyEventEdits(raw, { summary, location, start, end, allDay });
    await saveEvent(href, conn, etag ?? undefined, updated);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't save that event.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
