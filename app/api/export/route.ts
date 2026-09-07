import { NextRequest, NextResponse } from "next/server";
import { listThreads, listNotesForUser } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { findUploadRefs } from "@/lib/uploadRefs";
import { create as createTar } from "tar";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import os from "os";

export async function GET(req: NextRequest) {
  const user = getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const threads = listThreads(user.id);
  const notes = listNotesForUser(user.id);

  const payload = {
    version: 2,
    exportedAt: Date.now(),
    threads: threads.map((t) => ({ id: t.id, name: t.name, createdAt: t.createdAt })),
    notes: notes.map((n) => ({
      id: n.id,
      content: n.content,
      starred: n.starred,
      threadId: n.threadId,
      createdAt: n.createdAt,
      updatedAt: n.updatedAt,
    })),
  };

  const userUploadDir = path.join(process.cwd(), "data", "uploads", user.id);
  const referencedFiles = new Set<string>();
  for (const note of notes) {
    for (const ref of findUploadRefs(note.content)) {
      if (ref.userId !== user.id) continue;
      if (fs.existsSync(path.join(userUploadDir, ref.filename))) {
        referencedFiles.add(ref.filename);
      }
    }
  }

  const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), "dm-notes-export-"));
  const archivePath = path.join(os.tmpdir(), `dm-notes-export-${randomUUID()}.tar.gz`);
  try {
    fs.writeFileSync(path.join(stagingDir, "data.json"), JSON.stringify(payload, null, 2));

    const entries = ["data.json"];
    if (referencedFiles.size > 0) {
      const stagedUploads = path.join(stagingDir, "uploads");
      fs.mkdirSync(stagedUploads);
      for (const filename of referencedFiles) {
        fs.copyFileSync(path.join(userUploadDir, filename), path.join(stagedUploads, filename));
      }
      entries.push("uploads");
    }

    await createTar({ gzip: true, file: archivePath, cwd: stagingDir }, entries);
    const buffer = fs.readFileSync(archivePath);

    const filename = `dm-notes-export-${new Date().toISOString().slice(0, 10)}.tar.gz`;
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/gzip",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } finally {
    fs.rmSync(stagingDir, { recursive: true, force: true });
    fs.rmSync(archivePath, { force: true });
  }
}
