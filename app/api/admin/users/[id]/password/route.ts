import { NextRequest, NextResponse } from "next/server";
import { getUserById, updateUserPassword } from "@/lib/db";
import { getCurrentUser, hashPassword } from "@/lib/auth";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = getCurrentUser(req);
  if (!admin) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!admin.isAdmin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const ip = getClientIp(req);
  if (!checkRateLimit(`admin-reset:${admin.id}:${ip}`, 20, 15 * 60 * 1000)) {
    return NextResponse.json(
      { error: "Too many attempts. Try again in a few minutes." },
      { status: 429 }
    );
  }

  const { id } = await params;
  const target = getUserById(id);
  if (!target) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json();
  const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
  if (newPassword.length < 8) {
    return NextResponse.json(
      { error: "New password must be at least 8 characters" },
      { status: 400 }
    );
  }

  updateUserPassword(id, hashPassword(newPassword));
  return NextResponse.json({ ok: true });
}
