import { NextRequest, NextResponse } from "next/server";
import {
  getUserByEmail,
  getUserWithHashById,
  updateUserEmail,
  updateUserPassword,
} from "@/lib/db";
import { getCurrentUser, hashPassword, verifyPassword } from "@/lib/auth";

export async function PATCH(req: NextRequest) {
  const user = getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = await req.json();
  const currentPassword =
    typeof body.currentPassword === "string" ? body.currentPassword : "";
  const newEmail = typeof body.newEmail === "string" ? body.newEmail.trim().toLowerCase() : "";
  const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";

  if (!newEmail && !newPassword) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const stored = getUserWithHashById(user.id);
  if (!stored || !verifyPassword(currentPassword, stored.passwordHash)) {
    return NextResponse.json({ error: "Current password is incorrect" }, { status: 401 });
  }

  if (newEmail) {
    if (!newEmail.includes("@")) {
      return NextResponse.json({ error: "A valid email is required" }, { status: 400 });
    }
    const existing = getUserByEmail(newEmail);
    if (existing && existing.id !== user.id) {
      return NextResponse.json(
        { error: "An account with that email already exists" },
        { status: 409 }
      );
    }
    updateUserEmail(user.id, newEmail);
  }

  if (newPassword) {
    if (newPassword.length < 8) {
      return NextResponse.json(
        { error: "New password must be at least 8 characters" },
        { status: 400 }
      );
    }
    updateUserPassword(user.id, hashPassword(newPassword));
  }

  return NextResponse.json({ id: user.id, email: newEmail || user.email });
}
