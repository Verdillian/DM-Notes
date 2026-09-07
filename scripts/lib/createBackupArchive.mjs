// Shared logic for both the automated (FTP) and manual (local file) backup
// scripts: safely snapshot the live database, bundle it with the uploaded
// images, and write one .tar.gz into the given destination directory.

import Database from "better-sqlite3";
import { create as createTar } from "tar";
import path from "path";
import fs from "fs";
import os from "os";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "notes.db");
const UPLOADS_DIR = path.join(DATA_DIR, "uploads");

export async function createBackupArchive(destDir) {
  if (!fs.existsSync(DB_PATH)) {
    throw new Error(`No database found at ${DB_PATH} — nothing to back up.`);
  }
  fs.mkdirSync(destDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), "dm-notes-backup-staging-"));

  try {
    const dbBackupPath = path.join(stagingDir, "notes.db");
    const db = new Database(DB_PATH, { readonly: true });
    await db.backup(dbBackupPath);
    db.close();

    const entries = ["notes.db"];
    if (fs.existsSync(UPLOADS_DIR)) {
      fs.cpSync(UPLOADS_DIR, path.join(stagingDir, "uploads"), { recursive: true });
      entries.push("uploads");
    }

    const archiveName = `dm-notes-backup-${timestamp}.tar.gz`;
    const archivePath = path.join(destDir, archiveName);
    await createTar({ gzip: true, file: archivePath, cwd: stagingDir }, entries);

    const sizeMb = (fs.statSync(archivePath).size / 1024 / 1024).toFixed(2);
    return { archivePath, archiveName, sizeMb };
  } finally {
    fs.rmSync(stagingDir, { recursive: true, force: true });
  }
}
