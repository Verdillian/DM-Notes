import { NextRequest, NextResponse } from "next/server";
import { getUserByEmail, createSession } from "@/lib/db";
import { verifyPassword, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (!checkRateLimit(`login:${ip}`, 10, 15 * 60 * 1000)) {
    return NextResponse.json(
      { error: "Too many login attempts. Try again in a few minutes." },
      { status: 429 }
    );
  }

  const body = await req.json();
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";

  const user = getUserByEmail(email);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  const session = createSession(user.id);
  const res = NextResponse.json({ id: user.id, email: user.email, isAdmin: user.isAdmin });
  res.cookies.set(
    SESSION_COOKIE,
    session.token,
    sessionCookieOptions(new Date(session.expiresAt))
  );
  return res;
}
