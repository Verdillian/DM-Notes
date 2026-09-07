import { NextRequest, NextResponse } from "next/server";
import { isRegistrationOpen, setSetting } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const user = getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  return NextResponse.json({ registrationOpen: isRegistrationOpen() });
}

export async function PATCH(req: NextRequest) {
  const user = getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  if (typeof body.registrationOpen !== "boolean") {
    return NextResponse.json({ error: "registrationOpen must be a boolean" }, { status: 400 });
  }
  setSetting("registration_open", body.registrationOpen ? "true" : "false");
  return NextResponse.json({ registrationOpen: body.registrationOpen });
}
