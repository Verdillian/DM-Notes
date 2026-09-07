// Nightly backup: safely snapshots the SQLite database + uploaded images,
// packs them into one archive, and pushes it to remote storage over FTP.
// Run manually with `npm run backup`, or on a schedule via cron:
//   0 3 * * * cd /path/to/dm-notes && npm run backup >> backup.log 2>&1
//
// Required environment variables (put them in a .env file and run with
// `node --env-file=.env scripts/backup.mjs`, or export them in your shell):
//   BACKUP_FTP_HOST      e.g. ftp.yourdomain.com
//   BACKUP_FTP_USER
//   BACKUP_FTP_PASSWORD
// Optional:
//   BACKUP_FTP_PORT      default 21
//   BACKUP_FTP_SECURE    "true" for FTPS (recommended if your host supports it), default "false"
//   BACKUP_FTP_DIR       remote directory to store backups in, default "/dm-notes-backups"
//   BACKUP_KEEP_LAST     how many recent backups to retain remotely, default 14

import Database from "better-sqlite3";
import { create as createTar } from "tar";
import { Client as FtpClient } from "basic-ftp";
import path from "path";
import fs from "fs";
import os from "os";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "notes.db");
const UPLOADS_DIR = path.join(DATA_DIR, "uploads");

const FTP_HOST = process.env.BACKUP_FTP_HOST;
const FTP_USER = process.env.BACKUP_FTP_USER;
const FTP_PASSWORD = process.env.BACKUP_FTP_PASSWORD;
const FTP_PORT = Number(process.env.BACKUP_FTP_PORT || 21);
const FTP_SECURE = process.env.BACKUP_FTP_SECURE === "true";
const FTP_REMOTE_DIR = process.env.BACKUP_FTP_DIR || "/dm-notes-backups";
const KEEP_LAST = Number(process.env.BACKUP_KEEP_LAST || 14);

function log(message) {
  console.log(`[backup ${new Date().toISOString()}] ${message}`);
}

async function main() {
  if (!FTP_HOST || !FTP_USER || !FTP_PASSWORD) {
    console.error(
      "Missing BACKUP_FTP_HOST / BACKUP_FTP_USER / BACKUP_FTP_PASSWORD environment variables."
    );
    process.exit(1);
  }
  if (!fs.existsSync(DB_PATH)) {
    console.error(`No database found at ${DB_PATH} — nothing to back up.`);
    process.exit(1);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dm-notes-backup-"));

  try {
    log("Snapshotting database (safe copy of a live, in-use SQLite file)...");
    const dbBackupPath = path.join(tmpDir, "notes.db");
    const db = new Database(DB_PATH, { readonly: true });
    await db.backup(dbBackupPath);
    db.close();

    log("Staging files for archive...");
    const entries = ["notes.db"];
    if (fs.existsSync(UPLOADS_DIR)) {
      fs.cpSync(UPLOADS_DIR, path.join(tmpDir, "uploads"), { recursive: true });
      entries.push("uploads");
    }

    const archiveName = `dm-notes-backup-${timestamp}.tar.gz`;
    const archivePath = path.join(tmpDir, archiveName);
    await createTar({ gzip: true, file: archivePath, cwd: tmpDir }, entries);

    const sizeMb = (fs.statSync(archivePath).size / 1024 / 1024).toFixed(2);
    log(`Archive ready: ${archiveName} (${sizeMb} MB)`);

    const client = new FtpClient();
    try {
      log(`Connecting to ${FTP_HOST}:${FTP_PORT}...`);
      await client.access({
        host: FTP_HOST,
        port: FTP_PORT,
        user: FTP_USER,
        password: FTP_PASSWORD,
        secure: FTP_SECURE,
      });

      await client.ensureDir(FTP_REMOTE_DIR);
      log(`Uploading to ${FTP_REMOTE_DIR}/${archiveName}...`);
      await client.uploadFrom(archivePath, archiveName);

      log(`Pruning old backups (keeping the last ${KEEP_LAST})...`);
      const files = await client.list();
      const backups = files
        .filter((f) => f.isFile && f.name.startsWith("dm-notes-backup-") && f.name.endsWith(".tar.gz"))
        .sort((a, b) => a.name.localeCompare(b.name));
      const toDelete = backups.slice(0, Math.max(0, backups.length - KEEP_LAST));
      for (const file of toDelete) {
        await client.remove(file.name);
        log(`Removed old backup: ${file.name}`);
      }
    } finally {
      client.close();
    }

    log("Backup complete.");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(`[backup] FAILED: ${err.message}`);
  process.exit(1);
});
