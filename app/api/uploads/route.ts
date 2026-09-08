import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { getCurrentUser } from "@/lib/auth";

const IMAGE_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};

// Common, safe document types — deliberately no executables/scripts/HTML.
const DOCUMENT_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "text/plain": "txt",
  "text/csv": "csv",
  "application/json": "json",
  "text/markdown": "md",
  "application/zip": "zip",
  "application/x-zip-compressed": "zip",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
};

const ALL_TYPES: Record<string, string> = { ...IMAGE_TYPES, ...DOCUMENT_TYPES };
const IMAGE_EXTS = new Set(Object.values(IMAGE_TYPES));

// Some browsers/OSes send a generic MIME type (or none) for less common
// document formats — fall back to the filename's own extension in that case.
const EXT_FALLBACK = new Set(Object.values(DOCUMENT_TYPES));

const MAX_BYTES = 20 * 1024 * 1024;

function resolveExt(file: File): string | null {
  if (ALL_TYPES[file.type]) return ALL_TYPES[file.type];
  const nameExt = file.name.split(".").pop()?.toLowerCase();
  if (nameExt && EXT_FALLBACK.has(nameExt)) return nameExt;
  return null;
}

export async function POST(req: NextRequest) {
  const user = getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }
  const ext = resolveExt(file);
  if (!ext) {
    return NextResponse.json({ error: "unsupported file type" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "file too large (max 20MB)" }, { status: 400 });
  }

  const dir = path.join(process.cwd(), "data", "uploads", user.id);
  fs.mkdirSync(dir, { recursive: true });
  const filename = `${randomUUID()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(path.join(dir, filename), buffer);

  return NextResponse.json(
    {
      url: `/api/uploads/${user.id}/${filename}`,
      isImage: IMAGE_EXTS.has(ext),
      name: file.name,
      size: file.size,
    },
    { status: 201 }
  );
}
