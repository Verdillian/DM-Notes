import crypto from "crypto";
import fs from "fs";
import path from "path";

// Encrypts CalDAV credentials at rest with AES-256-GCM. The key never lives
// in notes.db itself — a copy of that one file (a stray backup, a peek at
// the SQLite file) isn't enough to read the password back out.
//
// Key source, in order:
//   1. CALDAV_ENCRYPTION_KEY env var, if set (64 hex chars / 32 bytes) —
//      lets anyone who wants the key managed outside this host do that.
//   2. Otherwise, a key is generated once and stored in
//      data/.encryption-key (0600), separate from notes.db. This is why
//      the backup scripts bundle that file alongside the database — losing
//      it makes any encrypted credential permanently unrecoverable.
//
// This protects against someone getting hold of the database file alone
// (a stolen backup, a misdirected file share) — it does not protect
// against a fully compromised host, which could just read the key file
// too. That's the same trust boundary the rest of this self-hosted app
// already assumes.

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_FILE = path.join(process.cwd(), "data", ".encryption-key");

let cachedKey: Buffer | null = null;

function loadOrCreateKey(): Buffer {
  if (cachedKey) return cachedKey;

  const envKey = process.env.CALDAV_ENCRYPTION_KEY?.trim();
  if (envKey) {
    const key = Buffer.from(envKey, "hex");
    if (key.length !== 32) {
      throw new Error(
        "CALDAV_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)"
      );
    }
    cachedKey = key;
    return key;
  }

  const dataDir = path.dirname(KEY_FILE);
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  if (fs.existsSync(KEY_FILE)) {
    cachedKey = Buffer.from(fs.readFileSync(KEY_FILE, "utf8").trim(), "hex");
    return cachedKey;
  }

  const key = crypto.randomBytes(32);
  fs.writeFileSync(KEY_FILE, key.toString("hex"), { mode: 0o600 });
  cachedKey = key;
  return key;
}

export function encrypt(plaintext: string): string {
  const key = loadOrCreateKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString("base64");
}

function decrypt(encoded: string): string {
  const key = loadOrCreateKey();
  const raw = Buffer.from(encoded, "base64");
  const iv = raw.subarray(0, IV_LENGTH);
  const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = raw.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

/**
 * Decrypts a stored value. If it isn't in our encrypted format — a
 * connection saved before this encryption was added — the GCM auth tag
 * check fails and the original plaintext is returned as-is instead, with
 * wasLegacy: true so the caller can opportunistically re-save it encrypted.
 */
export function decryptStored(value: string): { text: string; wasLegacy: boolean } {
  try {
    return { text: decrypt(value), wasLegacy: false };
  } catch {
    return { text: value, wasLegacy: true };
  }
}
