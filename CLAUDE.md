@AGENTS.md

# DM Notes — orientation for future agents

A self-hosted, chat-style note-taking app (Next.js App Router + TypeScript
+ Tailwind v4 + better-sqlite3). See README.md for the user-facing feature
list and known limitations. This section is for whoever picks up this repo
next — it covers what isn't obvious from reading the code cold.

## Data model & storage

Everything lives in one SQLite file (`data/notes.db`, gitignored) plus
`data/uploads/<userId>/` for images and attachments, and
`data/.encryption-key` (auto-generated, 0600, gitignored — or set
`CALDAV_ENCRYPTION_KEY` in `.env` instead) for the AES-256-GCM key that
encrypts stored CalDAV credentials. `lib/db.ts` is the only place that
touches the database. Schema changes are additive, idempotent migrations
guarded by `hasColumn()` at module load, applied via the `safeAddColumn()`
helper (try/catch around the `ALTER TABLE`, swallowing "duplicate column
name") rather than a bare `db.exec` — Next's build spawns multiple worker
processes that can race a naive check-then-`ALTER` migration on a fresh
database, which crashed a real Docker build under emulated arm64 before
this was added. Never assume a fresh schema, and never a destructive
`ALTER`.

Both notes and threads are soft-deleted (`deleted_at`, NULL = active).
`listNotesForUser`/`listThreads` filter them out; the trash views purge
anything older than 30 days on read. Deleting a thread cascades a
soft-delete to its currently-active notes, tagged with the *same*
`deleted_at` timestamp as the thread itself — that shared timestamp is
what lets `restoreThread` know which notes to bring back (only ones that
match exactly) without touching notes that were already independently
trashed before the thread was deleted, and what lets the Notes trash tab
correctly hide cascade-deleted notes (bundled into the Threads tab
instead) while still showing independently-trashed ones. Because of this,
there are two separate thread-ownership lookups in `lib/db.ts`:
`getThreadOwner` (unfiltered — used by note delete/restore/permanent-delete,
which must keep working even if the note's thread is later also trashed)
and `getActiveThreadOwner` (filters `deleted_at IS NULL` — used only by
`createNote`/`updateNote`'s move-to-thread validation, where creating or
moving a note into an already-deleted thread should actually be blocked).
Don't collapse these back into one function without re-checking both call
sites. Threads also carry a `sort_order` column (full-renumber-on-reorder,
not fractional indexing — simple and fine at personal-note-taking scale)
that the sidebar's drag-and-drop reordering (`@dnd-kit`) writes via
`PATCH /api/threads/reorder`; it's intentionally not part of the public
`Thread` type returned to the client, since ordering is trusted from the
API response array order rather than exposed as a sortable field.

## Theming (app/globals.css, lib/themes.ts)

Four fixed themes (`green` default, `paper`, `terminal`, `jewel`), each a
complete light-or-dark world — none of them follow `prefers-color-scheme`.
The mechanism is not obvious, so before touching it:

- Tailwind v4 normally *inlines* theme colors into generated utility
  classes at build time (`.bg-brand-600{background-color:#1c6b43}`), which
  would make them impossible to override at runtime. To get around that,
  every themed color is declared as a **plain CSS custom property first**
  (`--brand-600: ...` in `:root` and in each `[data-app-theme="…"]` block),
  and `@theme inline` only *points* Tailwind's token at that variable
  (`--color-brand-600: var(--brand-600)`). That indirection is what makes
  `.bg-brand-600` compile to `background-color:var(--brand-600)` instead of
  a literal hex — verified by grepping the compiled CSS in `.next/`, not
  assumed. If a new themed color is ever added, it must follow this same
  two-step pattern or it won't be theme-reactive. This trick was also used
  to override Tailwind's built-in `white` key — it's not just for custom
  tokens.
- `dark:` is repointed from the OS preference to a `data-mode` attribute
  via `@custom-variant dark (&:where([data-mode="dark"], [data-mode="dark"] *))`.
  `data-app-theme` and `data-mode` are both set once, server-side, in
  `app/layout.tsx` (an async component reading the `theme` cookie via
  `next/headers`) — this is what avoids a flash of the wrong theme on
  load. The theme itself is a per-user DB column; the cookie is just a
  same-value cache so SSR doesn't need a DB round trip.
- Changing a theme from Settings calls `PATCH /api/account/theme`, which
  updates the DB and re-sets the cookie, then the client also mutates
  `document.documentElement.dataset` directly for instant feedback in the
  current tab (flagged with `eslint-disable react-hooks/immutability` —
  that's a deliberate, user-triggered DOM sync, not a lint bug to "fix").
- Terminal intentionally has no bubble shadow and no border-radius
  differentiation was ever built for it or Jewel-tone (the original design
  mockup gave them different corner radii; only color, font-family, and
  shadow-vs-border made it into the real app). If asked to finish that,
  it's still open.

## Testing discipline — read this before touching real data

This project has real production data (the user's actual notes). Early in
development, real user notes were accidentally deleted during manual
testing before accounts existed. Since then, every feature has been
verified against **disposable test accounts only**:
register with a throwaway `+timestamp@example.com` address, exercise the
feature via `curl` with a cookie jar, then delete that user's rows
directly (users/sessions/threads/notes tables) with a one-off
`node -e "..."` script using `better-sqlite3` — never touch or assume
anything about existing rows belonging to real accounts. Never run
destructive SQL, `git reset`/`checkout`, or bulk deletes against
`data/notes.db` without this kind of isolation.

## Verification checklist (every change, before committing)

1. `npx tsc --noEmit`
2. `npx eslint app lib components`
3. `npm run build` (rm -rf .next first if colors/tokens changed, to rule
   out stale compiled CSS)
4. `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/` — dev
   server should still be running and healthy
5. For anything schema- or auth-related, a real functional test against a
   disposable account as above — type-checking a route doesn't prove the
   SQL is right.

## Deployment

`Dockerfile` + `docker-compose.yml` build a standalone container (Debian
slim, not Alpine, because `better-sqlite3`'s native addon needs a libc
prebuild path); `./data` is bind-mounted for the DB and uploads so it
survives rebuilds. `npm run backup` / `backup:local` (see README) handle
off-box backups. `.env.example` documents the FTP backup variables.
