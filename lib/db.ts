import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { randomUUID, randomBytes } from "crypto";

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
`);

function hasColumn(table: string, column: string): boolean {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as {
    name: string;
  }[];
  return cols.some((c) => c.name === column);
}

if (!hasColumn("notes", "thread_id")) {
  db.exec(`ALTER TABLE notes ADD COLUMN thread_id TEXT NOT NULL DEFAULT ''`);
}
if (!hasColumn("threads", "user_id")) {
  // empty string marks a pre-accounts "orphan" thread, claimed by the first
  // user to register so existing notes aren't lost when accounts were added.
  db.exec(`ALTER TABLE threads ADD COLUMN user_id TEXT NOT NULL DEFAULT ''`);
}

export type User = { id: string; email: string; createdAt: number };
type UserWithHash = User & { passwordHash: string };

export type Note = {
  id: string;
  content: string;
  starred: boolean;
  threadId: string;
  createdAt: number;
  updatedAt: number;
};

export type Thread = {
  id: string;
  name: string;
  userId: string;
  createdAt: number;
};

type NoteRow = {
  id: string;
  content: string;
  starred: number;
  thread_id: string;
  created_at: number;
  updated_at: number;
};

type ThreadRow = {
  id: string;
  name: string;
  user_id: string;
  created_at: number;
};

type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  created_at: number;
};

function rowToNote(row: NoteRow): Note {
  return {
    id: row.id,
    content: row.content,
    starred: !!row.starred,
    threadId: row.thread_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToThread(row: ThreadRow): Thread {
  return { id: row.id, name: row.name, userId: row.user_id, createdAt: row.created_at };
}

function rowToUser(row: UserRow): UserWithHash {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    createdAt: row.created_at,
  };
}

// ---- users & sessions ----

export function createUser(email: string, passwordHash: string): User {
  const id = randomUUID();
  const now = Date.now();
  db.prepare(
    "INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)"
  ).run(id, email, passwordHash, now);
  return { id, email, createdAt: now };
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

export function updateUserEmail(id: string, email: string): User | null {
  const existing = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as
    | UserRow
    | undefined;
  if (!existing) return null;
  db.prepare("UPDATE users SET email = ? WHERE id = ?").run(email, id);
  return { id, email, createdAt: existing.created_at };
}

export function updateUserPassword(id: string, passwordHash: string): boolean {
  const result = db
    .prepare("UPDATE users SET password_hash = ? WHERE id = ?")
    .run(passwordHash, id);
  return result.changes > 0;
}

export function getUserById(id: string): User | null {
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as
    | UserRow
    | undefined;
  if (!row) return null;
  return { id: row.id, email: row.email, createdAt: row.created_at };
}

export function countUsers(): number {
  return (db.prepare("SELECT COUNT(*) as c FROM users").get() as { c: number }).c;
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
    .prepare("SELECT * FROM threads WHERE user_id = ? ORDER BY created_at ASC")
    .all(userId) as ThreadRow[];
  return rows.map(rowToThread);
}

export function createThread(name: string, userId: string): Thread {
  const id = randomUUID();
  const now = Date.now();
  db.prepare(
    "INSERT INTO threads (id, name, user_id, created_at) VALUES (?, ?, ?, ?)"
  ).run(id, name, userId, now);
  return { id, name, userId, createdAt: now };
}

export function renameThread(id: string, name: string, userId: string): Thread | null {
  const existing = db
    .prepare("SELECT * FROM threads WHERE id = ? AND user_id = ?")
    .get(id, userId) as ThreadRow | undefined;
  if (!existing) return null;
  db.prepare("UPDATE threads SET name = ? WHERE id = ?").run(name, id);
  return rowToThread({ ...existing, name });
}

export function deleteThread(id: string, userId: string): boolean {
  const existing = db
    .prepare("SELECT id FROM threads WHERE id = ? AND user_id = ?")
    .get(id, userId);
  if (!existing) return false;
  const tx = db.transaction((threadId: string) => {
    db.prepare("DELETE FROM notes WHERE thread_id = ?").run(threadId);
    db.prepare("DELETE FROM threads WHERE id = ?").run(threadId);
  });
  tx(id);
  return true;
}

export function importThread(name: string, userId: string, createdAt: number): Thread {
  const id = randomUUID();
  db.prepare(
    "INSERT INTO threads (id, name, user_id, created_at) VALUES (?, ?, ?, ?)"
  ).run(id, name, userId, createdAt);
  return { id, name, userId, createdAt };
}

// ---- notes ----

function getThreadOwner(threadId: string): string | null {
  const row = db.prepare("SELECT user_id FROM threads WHERE id = ?").get(threadId) as
    | { user_id: string }
    | undefined;
  return row ? row.user_id : null;
}

export function listNotesForUser(userId: string): Note[] {
  const rows = db
    .prepare(
      `SELECT n.* FROM notes n
       JOIN threads t ON n.thread_id = t.id
       WHERE t.user_id = ?
       ORDER BY n.created_at ASC`
    )
    .all(userId) as NoteRow[];
  return rows.map(rowToNote);
}

export function createNote(content: string, threadId: string, userId: string): Note | null {
  if (getThreadOwner(threadId) !== userId) return null;
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
  if (updates.threadId && getThreadOwner(updates.threadId) !== userId) return null;

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
    "Text styling — type this:\n\n```\n**bold**, *italic*, ~~strikethrough~~\n```\n\nto get: **bold**, *italic*, ~~strikethrough~~"
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
  return { id, content, starred, threadId, createdAt, updatedAt };
}

export default db;
