# DM Notes

A self-hosted, chat-style note-taking app. Capture notes the way you'd send yourself a DM — type and hit enter — then organize with threads, tags, and note-to-note links. No AI, no third-party accounts, your data stays on your own server.

## Features

- **Chat-style capture** — a single input, notes stream chronologically like a DM thread.
- **Threads** — split notes into categories (Work, Recipes, Journal, ...), with cross-thread search.
- **Rich formatting** — bold/italic/strikethrough, inline code, syntax-highlighted fenced code blocks with a copy button, tables, headings, blockquotes, horizontal rules.
- **`#tags`** — click a tag to filter the current view.
- **`[[note links]]`** — link to another note with autocomplete; click to jump to it.
- **Checklists** — `- [ ] task` renders as a clickable checkbox.
- **Images** — attach via the composer or paste a screenshot directly.
- **Pinning** — star a note to surface it in a pinned strip at the top of its thread.
- **Accounts** — email/password auth, sessions via httpOnly cookies, passwords hashed with scrypt. The first account is an admin and can open/close registration to others, and reset any user's password.
- **Export/Import** — full JSON backup and restore from Settings.
- **Calendar (CalDAV)** — connect a CalDAV server (Baikal, Nextcloud, iCloud-compatible servers, etc.) in Settings to see, create, edit, and delete events in a month view alongside your notes. Reads each calendar's real color, expands recurring events properly, and supports daily/weekly/monthly/yearly recurrence when creating or editing.

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), register an account, and you'll land in a seeded "Welcome" thread that walks through the formatting syntax.

Data is stored locally in a SQLite database and an uploads folder under `./data`, which is gitignored.

## Backups

`npm run backup` snapshots the database (a safe copy of the live file, not a raw `cp`) and uploaded images into one `.tar.gz`, then pushes it over FTP to remote storage — so you don't lose everything if the machine running this dies.

1. Copy `.env.example` to `.env` and fill in `BACKUP_FTP_HOST`, `BACKUP_FTP_USER`, `BACKUP_FTP_PASSWORD` (any FTP-accessible storage works — e.g. space on a shared web hosting plan you already pay for).
2. Run `npm run backup` once to confirm it connects and uploads successfully.
3. Schedule it, e.g. nightly via cron:
   ```
   0 3 * * * cd /path/to/dm-notes && npm run backup >> backup.log 2>&1
   ```

Old backups are pruned automatically, keeping the most recent 14 by default (`BACKUP_KEEP_LAST`). If your FTP host supports FTPS, set `BACKUP_FTP_SECURE=true` so credentials and data aren't sent in the clear.

**`npm run backup:manual`** does the same safe snapshot but just saves the `.tar.gz` to a local `./backups` folder — no FTP setup needed. Use it for an on-demand backup you upload yourself, wherever you like.

## Stack

Next.js (App Router) + TypeScript + Tailwind CSS, `better-sqlite3` for storage, `marked` + `highlight.js` for rendering, `node-ical` + `fast-xml-parser` for CalDAV.

## Known limitations

- CalDAV credentials are stored in the SQLite database as plaintext, not encrypted at rest. Fine for a single-user self-hosted instance where the database file itself is the trust boundary; if you deploy this more broadly, add encryption before storing them.
- Editing or deleting a recurring event affects the whole series — there's no per-occurrence override yet.
- No password-reset email flow; an admin can reset any user's password from Settings instead.

---

VERDILLIAN © 2026
