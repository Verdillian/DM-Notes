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
} from "@/lib/db";
import { hashPassword, SESSION_COOKIE } from "@/lib/auth";

export async function POST(req: NextRequest) {
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

  // the very first account inherits any pre-accounts threads/notes
  if (countUsers() === 1) {
    claimOrphanThreads(user.id);
  }
  createWelcomeThread(user.id);
  if (listThreads(user.id).length === 1) {
    // nothing was inherited — give a brand new account a starter thread too
    createThread("General", user.id);
  }

  const session = createSession(user.id);
  const res = NextResponse.json({ id: user.id, email: user.email }, { status: 201 });
  res.cookies.set(SESSION_COOKIE, session.token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    expires: new Date(session.expiresAt),
  });
  return res;
}
