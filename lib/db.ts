import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { randomUUID, randomBytes } from "crypto";
import { DEFAULT_THEME, isValidTheme, type Theme } from "./themes";
import { encrypt, decryptStored } from "./crypto";

const dataDir = path.join(process.cwd(), "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(path.join(dataDir, "notes.db"));
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS threads (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    content TEXT NOT NULL,
    starred INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS caldav_connections (
    user_id TEXT PRIMARY KEY,
    url TEXT NOT NULL,
    username TEXT NOT NULL,
    password TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
`);

function hasColumn(table: string, column: string): boolean {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as {
    name: string;
  }[];
  return cols.some((c) => c.name === column);
}

// Next's build step imports this module from multiple worker processes
// concurrently, so two workers can both see a column as missing and both
// try to add it — the loser gets "duplicate column name" from SQLite. The
// hasColumn() check above is just an optimization to skip the common case;
// this is what actually makes each migration safe to race.
function safeAddColumn(alterSql: string) {
  try {
    db.exec(alterSql);
  } catch (err) {
    if (err instanceof Error && /duplicate column name/i.test(err.message)) return;
    throw err;
  }
}

const TRASH_RETENTION_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

if (!hasColumn("notes", "thread_id")) {
  safeAddColumn(`ALTER TABLE notes ADD COLUMN thread_id TEXT NOT NULL DEFAULT ''`);
}
if (!hasColumn("threads", "user_id")) {
  // empty string marks a pre-accounts "orphan" thread, claimed by the first
  // user to register so existing notes aren't lost when accounts were added.
  safeAddColumn(`ALTER TABLE threads ADD COLUMN user_id TEXT NOT NULL DEFAULT ''`);
}
if (!hasColumn("notes", "deleted_at")) {
  safeAddColumn(`ALTER TABLE notes ADD COLUMN deleted_at INTEGER`);
}
if (!hasColumn("threads", "pinned")) {
  safeAddColumn(`ALTER TABLE threads ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0`);
}
if (!hasColumn("threads", "deleted_at")) {
  safeAddColumn(`ALTER TABLE threads ADD COLUMN deleted_at INTEGER`);
}
if (!hasColumn("threads", "sort_order")) {
  safeAddColumn(`ALTER TABLE threads ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0`);
  // backfill so upgrading doesn't scramble anyone's existing thread order —
  // safe to run redundantly if two workers race this migration, since it's
  // the same idempotent result either way.
  db.exec(`UPDATE threads SET sort_order = created_at`);
}
if (!hasColumn("users", "theme")) {
  safeAddColumn(`ALTER TABLE users ADD COLUMN theme TEXT NOT NULL DEFAULT '${DEFAULT_THEME}'`);
}
if (!hasColumn("users", "is_admin")) {
  safeAddColumn(`ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0`);
  // accounts created before the admin flag existed have none set — grant it
  // to whichever account is earliest, so admin access isn't orphaned.
  const anyAdmin = db.prepare("SELECT id FROM users WHERE is_admin = 1").get();
  if (!anyAdmin) {
    const earliest = db
      .prepare("SELECT id FROM users ORDER BY created_at ASC LIMIT 1")
      .get() as { id: string } | undefined;
    if (earliest) {
      db.prepare("UPDATE users SET is_admin = 1 WHERE id = ?").run(earliest.id);
    }
  }
}

export type User = {
  id: string;
  email: string;
  isAdmin: boolean;
  createdAt: number;
  theme: Theme;
};
type UserWithHash = User & { passwordHash: string };

export type Note = {
  id: string;
  content: string;
  starred: boolean;
  threadId: string;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
};

export type Thread = {
  id: string;
  name: string;
  userId: string;
  createdAt: number;
  pinned: boolean;
  deletedAt: number | null;
};

type NoteRow = {
  id: string;
  content: string;
  starred: number;
  thread_id: string;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
};

type ThreadRow = {
  id: string;
  name: string;
  user_id: string;
  created_at: number;
  pinned: number;
  deleted_at: number | null;
  sort_order: number;
};

type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  is_admin: number;
  created_at: number;
  theme: string;
};

function rowToNote(row: NoteRow): Note {
  return {
    id: row.id,
    content: row.content,
    starred: !!row.starred,
    threadId: row.thread_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

function rowToThread(row: ThreadRow): Thread {
  return {
    id: row.id,
    name: row.name,
    userId: row.user_id,
    createdAt: row.created_at,
    pinned: !!row.pinned,
    deletedAt: row.deleted_at,
  };
}

function rowToUser(row: UserRow): UserWithHash {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    isAdmin: !!row.is_admin,
    createdAt: row.created_at,
    theme: isValidTheme(row.theme) ? row.theme : DEFAULT_THEME,
  };
}

// ---- users & sessions ----

export function createUser(email: string, passwordHash: string): User {
  const id = randomUUID();
  const now = Date.now();
  db.prepare(
    "INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)"
  ).run(id, email, passwordHash, now);
  return { id, email, isAdmin: false, createdAt: now, theme: DEFAULT_THEME };
}

export function setUserAdmin(id: string, isAdmin: boolean) {
  db.prepare("UPDATE users SET is_admin = ? WHERE id = ?").run(isAdmin ? 1 : 0, id);
}

export function getUserByEmail(email: string): UserWithHash | null {
  const row = db.prepare("SELECT * FROM users WHERE email = ?").get(email) as
    | UserRow
    | undefined;
  return row ? rowToUser(row) : null;
}

export function getUserWithHashById(id: string): UserWithHash | null {
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as
    | UserRow
    | undefined;
  return row ? rowToUser(row) : null;
}

function toPublicUser(row: UserRow): User {
  const { id, email, isAdmin, createdAt, theme } = rowToUser(row);
  return { id, email, isAdmin, createdAt, theme };
}

export function updateUserEmail(id: string, email: string): User | null {
  const existing = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as
    | UserRow
    | undefined;
  if (!existing) return null;
  db.prepare("UPDATE users SET email = ? WHERE id = ?").run(email, id);
  return toPublicUser({ ...existing, email });
}

export function updateUserPassword(id: string, passwordHash: string): boolean {
  const result = db
    .prepare("UPDATE users SET password_hash = ? WHERE id = ?")
    .run(passwordHash, id);
  return result.changes > 0;
}

export function updateUserTheme(id: string, theme: Theme): User | null {
  const existing = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as
    | UserRow
    | undefined;
  if (!existing) return null;
  db.prepare("UPDATE users SET theme = ? WHERE id = ?").run(theme, id);
  return toPublicUser({ ...existing, theme });
}

export function getUserById(id: string): User | null {
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as
    | UserRow
    | undefined;
  if (!row) return null;
  return toPublicUser(row);
}

export function countUsers(): number {
  return (db.prepare("SELECT COUNT(*) as c FROM users").get() as { c: number }).c;
}

export function listUsers(): User[] {
  const rows = db.prepare("SELECT * FROM users ORDER BY created_at ASC").all() as UserRow[];
  return rows.map(toPublicUser);
}

export function claimOrphanThreads(userId: string) {
  db.prepare("UPDATE threads SET user_id = ? WHERE user_id = ''").run(userId);
}

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

export function createSession(userId: string): { token: string; expiresAt: number } {
  const token = randomBytes(32).toString("hex");
  const now = Date.now();
  const expiresAt = now + SESSION_TTL_MS;
  db.prepare(
    "INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)"
  ).run(token, userId, now, expiresAt);
  return { token, expiresAt };
}

export function getSession(token: string): { userId: string } | null {
  const row = db.prepare("SELECT * FROM sessions WHERE token = ?").get(token) as
    | { token: string; user_id: string; created_at: number; expires_at: number }
    | undefined;
  if (!row) return null;
  if (row.expires_at < Date.now()) {
    db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
    return null;
  }
  return { userId: row.user_id };
}

export function deleteSession(token: string) {
  db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
}

// ---- threads ----

export function listThreads(userId: string): Thread[] {
  const rows = db
    .prepare(
      "SELECT * FROM threads WHERE user_id = ? AND deleted_at IS NULL ORDER BY pinned DESC, sort_order ASC"
    )
    .all(userId) as ThreadRow[];
  return rows.map(rowToThread);
}

// Drag-and-drop reorder: the client sends the full ordered list of its
// (non-deleted) thread ids and each gets re-numbered to its index. Simple
// full-renumber rather than fractional-index insertion — at the scale of
// one person's threads, renumbering everything on every reorder is cheap
// and avoids float-precision edge cases entirely.
export function reorderThreads(userId: string, orderedIds: string[]): boolean {
  const owned = db
    .prepare("SELECT id FROM threads WHERE user_id = ? AND deleted_at IS NULL")
    .all(userId) as { id: string }[];
  const ownedIds = new Set(owned.map((r) => r.id));
  if (orderedIds.length !== owned.length) return false;
  if (!orderedIds.every((id) => ownedIds.has(id))) return false;

  const update = db.prepare("UPDATE threads SET sort_order = ? WHERE id = ?");
  const tx = db.transaction(() => {
    orderedIds.forEach((id, index) => update.run(index, id));
  });
  tx();
  return true;
}

export function createThread(name: string, userId: string): Thread {
  const id = randomUUID();
  const now = Date.now();
  // sort_order = now() lands a new thread after everything else, whether
  // existing threads still use their original createdAt-based sort_order
  // or small 0,1,2... indices from a manual reorder — both are always
  // smaller than a fresh timestamp.
  db.prepare(
    "INSERT INTO threads (id, name, user_id, created_at, sort_order) VALUES (?, ?, ?, ?, ?)"
  ).run(id, name, userId, now, now);
  return { id, name, userId, createdAt: now, pinned: false, deletedAt: null };
}

export function renameThread(id: string, name: string, userId: string): Thread | null {
  const existing = db
    .prepare("SELECT * FROM threads WHERE id = ? AND user_id = ?")
    .get(id, userId) as ThreadRow | undefined;
  if (!existing) return null;
  db.prepare("UPDATE threads SET name = ? WHERE id = ?").run(name, id);
  return rowToThread({ ...existing, name });
}

export function setThreadPinned(id: string, userId: string, pinned: boolean): Thread | null {
  const existing = db
    .prepare("SELECT * FROM threads WHERE id = ? AND user_id = ?")
    .get(id, userId) as ThreadRow | undefined;
  if (!existing) return null;
  db.prepare("UPDATE threads SET pinned = ? WHERE id = ?").run(pinned ? 1 : 0, id);
  return rowToThread({ ...existing, pinned: pinned ? 1 : 0 });
}

export function deleteThread(id: string, userId: string): boolean {
  const existing = db
    .prepare("SELECT id FROM threads WHERE id = ? AND user_id = ? AND deleted_at IS NULL")
    .get(id, userId);
  if (!existing) return false;
  const now = Date.now();
  const tx = db.transaction(() => {
    // cascade to whatever notes are currently active in this thread, tagged
    // with the SAME timestamp as the thread itself so restoreThread() can
    // tell "deleted because the thread was deleted" apart from a note that
    // was already individually trashed beforehand (which should stay trashed).
    db.prepare(
      "UPDATE notes SET deleted_at = ? WHERE thread_id = ? AND deleted_at IS NULL"
    ).run(now, id);
    db.prepare("UPDATE threads SET deleted_at = ? WHERE id = ?").run(now, id);
  });
  tx();
  return true;
}

export function restoreThread(id: string, userId: string): Thread | null {
  const existing = db
    .prepare("SELECT * FROM threads WHERE id = ? AND user_id = ? AND deleted_at IS NOT NULL")
    .get(id, userId) as ThreadRow | undefined;
  if (!existing) return null;
  const deletedAt = existing.deleted_at;
  const tx = db.transaction(() => {
    db.prepare("UPDATE threads SET deleted_at = NULL WHERE id = ?").run(id);
    db.prepare(
      "UPDATE notes SET deleted_at = NULL WHERE thread_id = ? AND deleted_at = ?"
    ).run(id, deletedAt);
  });
  tx();
  return rowToThread({ ...existing, deleted_at: null });
}

export function permanentlyDeleteThread(id: string, userId: string): boolean {
  const existing = db.prepare("SELECT id FROM threads WHERE id = ? AND user_id = ?").get(id, userId);
  if (!existing) return false;
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM notes WHERE thread_id = ?").run(id);
    db.prepare("DELETE FROM threads WHERE id = ?").run(id);
  });
  tx();
  return true;
}

function purgeOldThreadTrash(userId: string) {
  const cutoff = Date.now() - TRASH_RETENTION_MS;
  const stale = db
    .prepare(
      "SELECT id FROM threads WHERE user_id = ? AND deleted_at IS NOT NULL AND deleted_at < ?"
    )
    .all(userId, cutoff) as { id: string }[];
  if (stale.length === 0) return;
  const tx = db.transaction(() => {
    for (const { id } of stale) {
      db.prepare("DELETE FROM notes WHERE thread_id = ?").run(id);
      db.prepare("DELETE FROM threads WHERE id = ?").run(id);
    }
  });
  tx();
}

export type TrashedThread = Thread & { noteCount: number };

export function listTrashedThreads(userId: string): TrashedThread[] {
  purgeOldThreadTrash(userId);
  const rows = db
    .prepare(
      `SELECT t.*, (SELECT COUNT(*) FROM notes n WHERE n.thread_id = t.id) as note_count
       FROM threads t
       WHERE t.user_id = ? AND t.deleted_at IS NOT NULL
       ORDER BY t.deleted_at DESC`
    )
    .all(userId) as (ThreadRow & { note_count: number })[];
  return rows.map((row) => ({ ...rowToThread(row), noteCount: row.note_count }));
}

export function importThread(name: string, userId: string, createdAt: number): Thread {
  const id = randomUUID();
  db.prepare(
    "INSERT INTO threads (id, name, user_id, created_at, sort_order) VALUES (?, ?, ?, ?, ?)"
  ).run(id, name, userId, createdAt, createdAt);
  return { id, name, userId, createdAt, pinned: false, deletedAt: null };
}

// ---- notes ----

// Ownership only — deliberately not filtered by deleted_at, since this is
// also used to authorize restoring/purging an individually-trashed note
// whose thread might independently be trashed too; that shouldn't block
// those operations. Creating/moving a note INTO a thread checks liveness
// separately via getActiveThreadOwner.
function getThreadOwner(threadId: string): string | null {
  const row = db.prepare("SELECT user_id FROM threads WHERE id = ?").get(threadId) as
    | { user_id: string }
    | undefined;
  return row ? row.user_id : null;
}

function getActiveThreadOwner(threadId: string): string | null {
  const row = db
    .prepare("SELECT user_id FROM threads WHERE id = ? AND deleted_at IS NULL")
    .get(threadId) as { user_id: string } | undefined;
  return row ? row.user_id : null;
}

export function listNotesForUser(userId: string): Note[] {
  const rows = db
    .prepare(
      `SELECT n.* FROM notes n
       JOIN threads t ON n.thread_id = t.id
       WHERE t.user_id = ? AND n.deleted_at IS NULL
       ORDER BY n.created_at ASC`
    )
    .all(userId) as NoteRow[];
  return rows.map(rowToNote);
}

function purgeOldTrash(userId: string) {
  const cutoff = Date.now() - TRASH_RETENTION_MS;
  db.prepare(
    `DELETE FROM notes WHERE id IN (
       SELECT n.id FROM notes n
       JOIN threads t ON n.thread_id = t.id
       WHERE t.user_id = ? AND n.deleted_at IS NOT NULL AND n.deleted_at < ?
     )`
  ).run(userId, cutoff);
}

export function listTrashedNotesForUser(userId: string): Note[] {
  purgeOldTrash(userId);
  const rows = db
    .prepare(
      // A note cascade-deleted along with its thread (same timestamp, set
      // atomically in deleteThread's transaction) is hidden here — it's
      // only reachable by restoring/purging that thread as a unit from the
      // Threads tab. A note that was ALREADY individually trashed before
      // its thread was later also deleted keeps its own distinct
      // deleted_at, so it stays visible and independently manageable here.
      `SELECT n.* FROM notes n
       JOIN threads t ON n.thread_id = t.id
       WHERE t.user_id = ? AND n.deleted_at IS NOT NULL
         AND (t.deleted_at IS NULL OR n.deleted_at != t.deleted_at)
       ORDER BY n.deleted_at DESC`
    )
    .all(userId) as NoteRow[];
  return rows.map(rowToNote);
}

export function createNote(content: string, threadId: string, userId: string): Note | null {
  if (getActiveThreadOwner(threadId) !== userId) return null;
  const now = Date.now();
  const id = randomUUID();
  db.prepare(
    "INSERT INTO notes (id, content, starred, thread_id, created_at, updated_at) VALUES (?, ?, 0, ?, ?, ?)"
  ).run(id, content, threadId, now, now);
  return {
    id,
    content,
    starred: false,
    threadId,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
}

export function updateNote(
  id: string,
  updates: { content?: string; starred?: boolean; threadId?: string },
  userId: string
): Note | null {
  const existingRow = db.prepare("SELECT * FROM notes WHERE id = ?").get(id) as
    | NoteRow
    | undefined;
  if (!existingRow) return null;
  if (getThreadOwner(existingRow.thread_id) !== userId) return null;
  if (updates.threadId && getActiveThreadOwner(updates.threadId) !== userId) return null;

  const content = updates.content ?? existingRow.content;
  const starred =
    updates.starred === undefined ? existingRow.starred : updates.starred ? 1 : 0;
  const threadId = updates.threadId ?? existingRow.thread_id;
  const now = Date.now();

  db.prepare(
    "UPDATE notes SET content = ?, starred = ?, thread_id = ?, updated_at = ? WHERE id = ?"
  ).run(content, starred, threadId, now, id);

  return rowToNote({
    ...existingRow,
    content,
    starred,
    thread_id: threadId,
    updated_at: now,
  });
}

export function deleteNote(id: string, userId: string): boolean {
  const row = db.prepare("SELECT thread_id FROM notes WHERE id = ?").get(id) as
    | { thread_id: string }
    | undefined;
  if (!row) return false;
  if (getThreadOwner(row.thread_id) !== userId) return false;
  const result = db
    .prepare("UPDATE notes SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL")
    .run(Date.now(), id);
  return result.changes > 0;
}

export function restoreNote(id: string, userId: string): Note | null {
  const row = db.prepare("SELECT * FROM notes WHERE id = ?").get(id) as NoteRow | undefined;
  if (!row) return null;
  if (getThreadOwner(row.thread_id) !== userId) return null;
  db.prepare("UPDATE notes SET deleted_at = NULL WHERE id = ?").run(id);
  return rowToNote({ ...row, deleted_at: null });
}

export function permanentlyDeleteNote(id: string, userId: string): boolean {
  const row = db.prepare("SELECT thread_id FROM notes WHERE id = ?").get(id) as
    | { thread_id: string }
    | undefined;
  if (!row) return false;
  if (getThreadOwner(row.thread_id) !== userId) return false;
  const result = db.prepare("DELETE FROM notes WHERE id = ?").run(id);
  return result.changes > 0;
}

export function createWelcomeThread(userId: string): Thread {
  const thread = createThread("Welcome", userId);
  let t = Date.now();
  const add = (content: string) => {
    const ts = t;
    t += 1;
    return importNote(content, thread.id, false, ts, ts);
  };

  const intro = add(
    "This works just like the DMs you send yourself — type below and hit enter, everything lands here in order."
  );
  add(
    "Tags — type this:\n\n```\n#tagname\n```\n\nto get a clickable chip you can filter by, like this: #tutorial"
  );
  add(
    'Threads (see the sidebar) split notes into categories, like Work or Recipes. Create one with the "+" button next to Threads.'
  );
  add(
    "Checklists — type this:\n\n```\n- [ ] task one\n- [x] task two\n```\n\nto get:\n\n- [ ] tap this box to check it off\n- [x] this one's already done"
  );
  add(
    "Star a note (hover it, tap the star) to pin it — pinned notes show up in a strip at the top of the thread."
  );
  add(
    `Linking notes — the raw pattern is:\n\n\`\`\`\n[[note-id|label]]\n\`\`\`\n\nbut you don't need to type an ID by hand: just type "[[" and pick from the autocomplete. Here's a real one: [[${intro.id}|the first tip]] — click it to jump there.`
  );
  add(
    "Linking out to the web — paste a URL and it auto-links: https://example.com — or give it your own text:\n\n```\n[some text](https://example.com)\n```\n\nto get: [some text](https://example.com)"
  );
  add(
    "Text styling — type this:\n\n```\n**bold**, *italic*, ~~strikethrough~~, ++underline++, ==highlight==, x^2^, H~2~O\n```\n\nto get: **bold**, *italic*, ~~strikethrough~~, ++underline++, ==highlight==, x^2^, H~2~O"
  );
  add(
    "Spoilers — hide text until it's tapped, like Discord:\n\n```\n||spoiler text||\n```\n\nto get: ||tap to reveal||"
  );
  add(
    'Code — wrap something in single backticks for inline code, or fence a block with three backticks and a language name for syntax highlighting plus a copy button:\n\n````\n```js\nconsole.log("hi")\n```\n````\n\nRendered:\n\n```js\nfunction hello() {\n  console.log("hi");\n}\n```'
  );
  add(
    "More formatting — headings, quotes, and dividers:\n\n```\n# Heading\n> a quote\n---\n```\n\nto get:\n\n# Heading\n> a quote\n---"
  );
  add(
    "Tables (grids) — type this:\n\n```\n| Item | Qty |\n| --- | --- |\n| Apples | 3 |\n```\n\nto get:\n\n| Item | Qty |\n| --- | --- |\n| Apples | 3 |"
  );
  add(
    'Pictures — tap the image icon next to the text box (or just paste a screenshot) to attach one; it embeds inline automatically, no typing needed.'
  );
  add("The search bar up top looks across every thread at once, not just this one.");
  add(
    "Forget any of this? Tap the (?) icon next to the search bar any time for a quick formatting reference."
  );
  add(
    "Have a CalDAV calendar? Connect it in Settings to see your events — and create, edit, or delete them — right alongside your notes."
  );
  add(
    'Your account, password, and backup (export/import) live in Settings, linked from the sidebar. Delete this thread whenever you\'re done with it — your real notes belong in "General" or wherever you like.'
  );

  return thread;
}

export function importNote(
  content: string,
  threadId: string,
  starred: boolean,
  createdAt: number,
  updatedAt: number
): Note {
  const id = randomUUID();
  db.prepare(
    "INSERT INTO notes (id, content, starred, thread_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(id, content, starred ? 1 : 0, threadId, createdAt, updatedAt);
  return { id, content, starred, threadId, createdAt, updatedAt, deletedAt: null };
}

// ---- app settings ----

export function getSetting(key: string, defaultValue: string): string {
  const row = db.prepare("SELECT value FROM app_settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row ? row.value : defaultValue;
}

export function setSetting(key: string, value: string) {
  db.prepare(
    "INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(key, value);
}

export function isRegistrationOpen(): boolean {
  return getSetting("registration_open", "true") === "true";
}

// ---- caldav ----

export type CaldavConnection = {
  url: string;
  username: string;
  password: string;
  createdAt: number;
};

type CaldavConnectionRow = {
  user_id: string;
  url: string;
  username: string;
  password: string;
  created_at: number;
};

export function getCaldavConnection(userId: string): CaldavConnection | null {
  const row = db
    .prepare("SELECT * FROM caldav_connections WHERE user_id = ?")
    .get(userId) as CaldavConnectionRow | undefined;
  if (!row) return null;

  const url = decryptStored(row.url);
  const username = decryptStored(row.username);
  const password = decryptStored(row.password);

  // self-heal: a connection saved before encryption was added comes back
  // as legacy plaintext above — re-save it encrypted now that it's decoded.
  if (url.wasLegacy || username.wasLegacy || password.wasLegacy) {
    setCaldavConnection(userId, {
      url: url.text,
      username: username.text,
      password: password.text,
    });
  }

  return {
    url: url.text,
    username: username.text,
    password: password.text,
    createdAt: row.created_at,
  };
}

export function setCaldavConnection(
  userId: string,
  conn: { url: string; username: string; password: string }
) {
  const now = Date.now();
  db.prepare(
    `INSERT INTO caldav_connections (user_id, url, username, password, created_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET url = excluded.url, username = excluded.username, password = excluded.password`
  ).run(userId, encrypt(conn.url), encrypt(conn.username), encrypt(conn.password), now);
}

export function deleteCaldavConnection(userId: string) {
  db.prepare("DELETE FROM caldav_connections WHERE user_id = ?").run(userId);
}

export default db;
