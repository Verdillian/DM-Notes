import { NextRequest, NextResponse } from "next/server";
import { getCaldavConnection } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { discoverCalendars } from "@/lib/caldav";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

export async function GET(req: NextRequest) {
  const user = getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const conn = getCaldavConnection(user.id);
  if (!conn) {
    return NextResponse.json({ error: "No calendar connected yet" }, { status: 400 });
  }

  const ip = getClientIp(req);
  if (!checkRateLimit(`caldav-calendars:${user.id}:${ip}`, 30, 15 * 60 * 1000)) {
    return NextResponse.json(
      { error: "Too many requests. Try again in a few minutes." },
      { status: 429 }
    );
  }

  try {
    const calendars = await discoverCalendars(conn);
    return NextResponse.json(calendars);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't list calendars.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
