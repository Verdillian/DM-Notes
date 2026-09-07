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

## Stack

Next.js (App Router) + TypeScript + Tailwind CSS, `better-sqlite3` for storage, `marked` + `highlight.js` for rendering, `node-ical` + `fast-xml-parser` for CalDAV.

## Known limitations

- CalDAV credentials are stored in the SQLite database as plaintext, not encrypted at rest. Fine for a single-user self-hosted instance where the database file itself is the trust boundary; if you deploy this more broadly, add encryption before storing them.
- Editing or deleting a recurring event affects the whole series — there's no per-occurrence override yet.
- No password-reset email flow; an admin can reset any user's password from Settings instead.

---

VERDILLIAN © 2026
