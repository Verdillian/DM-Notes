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
  pdf: "application/pdf",
  txt: "text/plain",
  csv: "text/csv",
  json: "application/json",
  md: "text/markdown",
  zip: "application/zip",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp"]);
const FILENAME_RE = new RegExp(`^[0-9a-f-]+\\.(${Object.keys(MIME).join("|")})$`, "i");

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
  if (!FILENAME_RE.test(filename)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const filePath = path.join(process.cwd(), "data", "uploads", userId, filename);
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const ext = filename.split(".").pop()!.toLowerCase();
  const buffer = fs.readFileSync(filePath);
  const headers: Record<string, string> = {
    "Content-Type": MIME[ext] ?? "application/octet-stream",
    "Cache-Control": "private, max-age=31536000, immutable",
  };

  // Non-images are attachments, not inline content — give them a sensible
  // download name instead of the random storage filename, if one was passed.
  if (!IMAGE_EXTS.has(ext)) {
    const originalName = req.nextUrl.searchParams.get("name");
    const suggested = originalName ? encodeURIComponent(originalName) : filename;
    headers["Content-Disposition"] = `attachment; filename*=UTF-8''${suggested}`;
  }

  return new NextResponse(new Uint8Array(buffer), { headers });
}
