import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getCurrentUser } from "@/lib/auth";

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string; filename: string }> }
) {
  const user = getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { userId, filename } = await params;
  if (userId !== user.id) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (!/^[0-9a-f-]+\.(png|jpe?g|gif|webp)$/i.test(filename)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const filePath = path.join(process.cwd(), "data", "uploads", userId, filename);
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const ext = filename.split(".").pop()!.toLowerCase();
  const buffer = fs.readFileSync(filePath);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": MIME[ext] ?? "application/octet-stream",
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
