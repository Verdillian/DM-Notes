import { NextRequest } from "next/server";
import crypto from "crypto";
import { getSession, getUserById, type User } from "./db";

export const SESSION_COOKIE = "session";

// secure requires HTTPS — only turn it on once this is actually deployed
// behind TLS (a reverse proxy, most likely), or the cookie will silently
// never be sent and nobody will be able to log in over plain http.
const isProduction = process.env.NODE_ENV === "production";

export function sessionCookieOptions(expires: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: isProduction,
    path: "/",
    expires,
  };
}

export function clearedSessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: isProduction,
    path: "/",
    expires: new Date(0),
  };
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const check = crypto.scryptSync(password, salt, 64).toString("hex");
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(check, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function getCurrentUser(req: NextRequest): User | null {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = getSession(token);
  if (!session) return null;
  return getUserById(session.userId);
}
