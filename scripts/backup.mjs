// Automated backup: safely snapshots the SQLite database + uploaded images,
// packs them into one archive, and pushes it to remote storage over FTP.
// Run manually with `npm run backup`, or on a schedule via cron:
//   0 3 * * * cd /path/to/dm-notes && npm run backup >> backup.log 2>&1
//
// For a one-off backup you upload yourself (no FTP config needed), use
// `npm run backup:manual` instead — see scripts/backup-local.mjs.
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

import { Client as FtpClient } from "basic-ftp";
import path from "path";
import fs from "fs";
import os from "os";
import { createBackupArchive } from "./lib/createBackupArchive.mjs";

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

  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "dm-notes-backup-out-"));
  try {
    log("Creating backup archive (safe database snapshot + uploads)...");
    const { archivePath, archiveName, sizeMb } = await createBackupArchive(outDir);
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
    fs.rmSync(outDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(`[backup] FAILED: ${err.message}`);
  process.exit(1);
});
