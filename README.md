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
- **Accounts** — email/password auth, sessions via httpOnly cookies, passwords hashed with scrypt.
- **Export/Import** — full JSON backup and restore from Settings.

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), register an account, and you'll land in a seeded "Welcome" thread that walks through the formatting syntax.

Data is stored locally in a SQLite database and an uploads folder under `./data`, which is gitignored.

## Stack

Next.js (App Router) + TypeScript + Tailwind CSS, `better-sqlite3` for storage, `marked` + `highlight.js` for rendering.

---

VERDILLIAN © 2026
