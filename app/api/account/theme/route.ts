import { NextRequest, NextResponse } from "next/server";
import { updateUserTheme } from "@/lib/db";
import { getCurrentUser, THEME_COOKIE, themeCookieOptions } from "@/lib/auth";
import { isValidTheme } from "@/lib/themes";

export async function PATCH(req: NextRequest) {
  const user = getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = await req.json();
  if (!isValidTheme(body.theme)) {
    return NextResponse.json({ error: "Not a valid theme" }, { status: 400 });
  }

  const updated = updateUserTheme(user.id, body.theme);
  if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });

  const res = NextResponse.json(updated);
  res.cookies.set(THEME_COOKIE, updated.theme, themeCookieOptions());
  return res;
}
