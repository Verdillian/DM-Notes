import { NextRequest, NextResponse } from "next/server";
import { importThread, importNote } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { findUploadRefs } from "@/lib/uploadRefs";
import { extract as extractTar } from "tar";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import os from "os";

type RawThread = { id?: unknown; name?: unknown; createdAt?: unknown };
type RawNote = {
  content?: unknown;
  threadId?: unknown;
  starred?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
};

const ALLOWED_UPLOAD_EXT = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "pdf",
  "txt",
  "csv",
  "json",
  "md",
  "zip",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
]);

function isGzip(buffer: Buffer): boolean {
  return buffer.length > 2 && buffer[0] === 0x1f && buffer[1] === 0x8b;
}

export async function POST(req: NextRequest) {
  const user = getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const contentType = req.headers.get("content-type") || "";
  let data: unknown;
  let extractedUploadsDir: string | null = null;
  let cleanupDir: string | null = null;

  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return NextResponse.json({ error: "file is required" }, { status: 400 });
      }
      const buffer = Buffer.from(await file.arrayBuffer());

      if (isGzip(buffer)) {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dm-notes-import-"));
        cleanupDir = tmpDir;
        const archivePath = path.join(tmpDir, "import.tar.gz");
        fs.writeFileSync(archivePath, buffer);
        const extractDir = path.join(tmpDir, "extracted");
        fs.mkdirSync(extractDir);
        await extractTar({ file: archivePath, cwd: extractDir });

        const dataJsonPath = path.join(extractDir, "data.json");
        if (!fs.existsSync(dataJsonPath)) {
          return NextResponse.json(
            { error: "Archive doesn't contain a data.json" },
            { status: 400 }
          );
        }
        data = JSON.parse(fs.readFileSync(dataJsonPath, "utf8"));
        const uploadsDir = path.join(extractDir, "uploads");
        if (fs.existsSync(uploadsDir)) extractedUploadsDir = uploadsDir;
      } else {
        try {
          data = JSON.parse(buffer.toString("utf8"));
        } catch {
          return NextResponse.json({ error: "That file isn't a valid backup" }, { status: 400 });
        }
      }
    } else {
      // backward compatibility with older plain-JSON exports (no images)
      try {
        data = await req.json();
      } catch {
        return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
      }
    }

    const threadsRaw = (data as { threads?: unknown })?.threads;
    const notesRaw = (data as { notes?: unknown })?.notes;
    if (!Array.isArray(threadsRaw) || !Array.isArray(notesRaw)) {
      return NextResponse.json(
        { error: "file doesn't look like a notes backup" },
        { status: 400 }
      );
    }

    const idMap = new Map<string, string>();
    let threadsImported = 0;
    for (const raw of threadsRaw as RawThread[]) {
      if (typeof raw?.id !== "string" || typeof raw?.name !== "string") continue;
      const createdAt = typeof raw.createdAt === "number" ? raw.createdAt : Date.now();
      const created = importThread(raw.name, user.id, createdAt);
      idMap.set(raw.id, created.id);
      threadsImported++;
    }

    let notesImported = 0;
    let imagesImported = 0;
    // maps the archive's original filename -> the new filename written for this user,
    // so an image referenced by several notes is only copied once
    const restoredFilenames = new Map<string, string>();

    for (const raw of notesRaw as RawNote[]) {
      if (typeof raw?.content !== "string" || typeof raw?.threadId !== "string") continue;
      const mappedThreadId = idMap.get(raw.threadId);
      if (!mappedThreadId) continue;
      const createdAt = typeof raw.createdAt === "number" ? raw.createdAt : Date.now();
      const updatedAt = typeof raw.updatedAt === "number" ? raw.updatedAt : createdAt;

      let content = raw.content;
      if (extractedUploadsDir) {
        for (const ref of findUploadRefs(content)) {
          const ext = ref.filename.split(".").pop()?.toLowerCase() ?? "";
          if (!ALLOWED_UPLOAD_EXT.has(ext)) continue;

          let newFilename = restoredFilenames.get(ref.filename);
          if (!newFilename) {
            const sourcePath = path.join(extractedUploadsDir, ref.filename);
            if (!fs.existsSync(sourcePath)) continue;
            newFilename = `${randomUUID()}.${ext}`;
            const destDir = path.join(process.cwd(), "data", "uploads", user.id);
            fs.mkdirSync(destDir, { recursive: true });
            fs.copyFileSync(sourcePath, path.join(destDir, newFilename));
            restoredFilenames.set(ref.filename, newFilename);
            imagesImported++;
          }
          content = content.split(ref.fullMatch).join(`/api/uploads/${user.id}/${newFilename}`);
        }
      }

      importNote(content, mappedThreadId, !!raw.starred, createdAt, updatedAt);
      notesImported++;
    }

    return NextResponse.json({ threadsImported, notesImported, imagesImported });
  } finally {
    if (cleanupDir) fs.rmSync(cleanupDir, { recursive: true, force: true });
  }
}
