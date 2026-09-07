import { NextRequest, NextResponse } from "next/server";
import { getCaldavConnection, setCaldavConnection, deleteCaldavConnection } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { discoverCalendars } from "@/lib/caldav";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

export async function GET(req: NextRequest) {
  const user = getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const conn = getCaldavConnection(user.id);
  if (!conn) return NextResponse.json({ connected: false });

  let calendars: { url: string; name: string }[] = [];
  let discoveryError: string | null = null;
  try {
    calendars = await discoverCalendars(conn);
  } catch (err) {
    discoveryError = err instanceof Error ? err.message : "Couldn't list calendars.";
  }

  return NextResponse.json({
    connected: true,
    url: conn.url,
    username: conn.username,
    calendars: calendars.map((c) => c.name),
    discoveryError,
  });
}

export async function POST(req: NextRequest) {
  const user = getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const ip = getClientIp(req);
  if (!checkRateLimit(`caldav-connect:${user.id}:${ip}`, 10, 15 * 60 * 1000)) {
    return NextResponse.json(
      { error: "Too many attempts. Try again in a few minutes." },
      { status: 429 }
    );
  }

  const body = await req.json();
  const url = typeof body.url === "string" ? body.url.trim() : "";
  const username = typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!url || !username || !password) {
    return NextResponse.json({ error: "URL, username, and password are all required" }, { status: 400 });
  }
  try {
    new URL(url);
  } catch {
    return NextResponse.json({ error: "That doesn't look like a valid URL" }, { status: 400 });
  }

  let calendars: { url: string; name: string }[] = [];
  try {
    calendars = await discoverCalendars({ url, username, password });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't connect to that server.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  setCaldavConnection(user.id, { url, username, password });
  return NextResponse.json({
    connected: true,
    url,
    username,
    calendars: calendars.map((c) => c.name),
  });
}

export async function DELETE(req: NextRequest) {
  const user = getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  deleteCaldavConnection(user.id);
  return NextResponse.json({ ok: true });
}
