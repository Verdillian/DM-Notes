// Manual, on-demand backup: same safe database snapshot + uploads archive
// as the automated FTP backup, but just saves it to a local folder instead
// of uploading it anywhere. Run it whenever you want, then upload the
// resulting file yourself (drag it into your host's file manager, an FTP
// client, cloud storage, wherever) — no FTP credentials required.
//
//   npm run backup:manual
//
// Optional environment variable:
//   BACKUP_LOCAL_DIR    where to save the archive, default "./backups"

import path from "path";
import { createBackupArchive } from "./lib/createBackupArchive.mjs";

const DEST_DIR = process.env.BACKUP_LOCAL_DIR || path.join(process.cwd(), "backups");

async function main() {
  console.log("Creating backup (safe database snapshot + uploads)...");
  const { archivePath, sizeMb } = await createBackupArchive(DEST_DIR);
  console.log(`\nBackup saved to: ${archivePath} (${sizeMb} MB)`);
  console.log("Upload this file to wherever you'd like to keep it safe.");
}

main().catch((err) => {
  console.error(`FAILED: ${err.message}`);
  process.exit(1);
});
