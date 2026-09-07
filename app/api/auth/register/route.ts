import { NextRequest, NextResponse } from "next/server";
import {
  createUser,
  getUserByEmail,
  createSession,
  countUsers,
  claimOrphanThreads,
  createThread,
  createWelcomeThread,
  listThreads,
  setUserAdmin,
  isRegistrationOpen,
} from "@/lib/db";
import { hashPassword, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (!checkRateLimit(`register:${ip}`, 5, 60 * 60 * 1000)) {
    return NextResponse.json(
      { error: "Too many attempts. Try again later." },
      { status: 429 }
    );
  }

  const isFirstUser = countUsers() === 0;
  if (!isFirstUser && !isRegistrationOpen()) {
    return NextResponse.json(
      { error: "Registration is currently closed. Ask the admin for access." },
      { status: 403 }
    );
  }

  const body = await req.json();
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "A valid email is required" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters" },
      { status: 400 }
    );
  }
  if (getUserByEmail(email)) {
    return NextResponse.json(
      { error: "An account with that email already exists" },
      { status: 409 }
    );
  }

  const user = createUser(email, hashPassword(password));

  if (isFirstUser) {
    setUserAdmin(user.id, true);
    // the very first account inherits any pre-accounts threads/notes
    claimOrphanThreads(user.id);
  }
  createWelcomeThread(user.id);
  if (listThreads(user.id).length === 1) {
    // nothing was inherited — give a brand new account a starter thread too
    createThread("General", user.id);
  }

  const session = createSession(user.id);
  const res = NextResponse.json(
    { id: user.id, email: user.email, isAdmin: isFirstUser },
    { status: 201 }
  );
  res.cookies.set(
    SESSION_COOKIE,
    session.token,
    sessionCookieOptions(new Date(session.expiresAt))
  );
  return res;
}
