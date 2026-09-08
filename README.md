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
- **Export/Import** — back up and restore your own notes, threads, and images entirely from Settings, no server access needed.
- **Calendar (CalDAV)** — connect a CalDAV server (Baikal, Nextcloud, iCloud-compatible servers, etc.) in Settings to see, create, edit, and delete events in a month view alongside your notes. Reads each calendar's real color, expands recurring events properly, and supports daily/weekly/monthly/yearly recurrence when creating or editing.
- **Quick switcher** — press Cmd/Ctrl+K to jump straight to any thread or note by name/content match.
- **Trash** — deleting a note doesn't erase it immediately; it's recoverable from Trash (sidebar) for 30 days before being purged for good.
- **Offline draft queue** — if a note fails to send (connection drop, server unreachable), it's kept locally and retried automatically once you're back online, instead of being lost.
- **Themes** — 4 built-in looks (Settings → Appearance): Modernized Green (default), Ink & Paper, Amber Terminal, and Deep Jewel-tone. Each is a fixed light-or-dark palette, per-account, applied server-side so there's no flash of the wrong theme on load.
- **Installable (PWA)** — add DM Notes to your phone or desktop home screen like a native app.

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), register an account, and you'll land in a seeded "Welcome" thread that walks through the formatting syntax.

Data is stored locally in a SQLite database and an uploads folder under `./data`, which is gitignored.

## Deploying (Docker)

This is the intended way to run DM Notes for real, e.g. on a home server behind a Cloudflare Tunnel or reverse proxy:

```bash
git clone https://github.com/Verdillian/DM-Notes.git
cd DM-Notes
cp .env.example .env   # do this even if you leave the backup fields blank —
                        # docker-compose.yml expects .env to exist
docker compose up -d --build
```

That builds the image, starts the container, and binds `./data` on the host so your notes and uploads survive rebuilds/upgrades. Point your reverse proxy or tunnel at `http://<this-machine>:3000`, then open the site and register — the **first account created is the admin** and can open/close registration to others from Settings.

To ship an update later: `git pull`, then `docker compose up -d --build` again. Schema changes are additive migrations that run automatically on startup — no manual migration step, but see **Backups** below before upgrading anything you'd be upset to lose.

### Pre-built image (Docker Hub / Portainer)

Every push to `main` builds and publishes `verdillian/dm-notes:latest` (amd64 + arm64) to Docker Hub via `.github/workflows/docker-publish.yml` — nobody needs to build the image by hand. That workflow needs two repository secrets set once, under the GitHub repo's **Settings → Secrets and variables → Actions**:

- `DOCKERHUB_USERNAME` — your Docker Hub username
- `DOCKERHUB_TOKEN` — a Docker Hub access token (Docker Hub → Account Settings → Security → New Access Token; don't use your account password)

With that published, deploying doesn't need this repo checked out at all:

- **Portainer**: Stacks → Add stack → paste the contents of `docker-compose.portainer.yml` (or point a Git-based stack at this repo and that file) → fill in the optional `BACKUP_FTP_*` environment variables in Portainer's UI if you want automated backups → Deploy. It pulls the Hub image and uses a named volume instead of a host path, so it doesn't depend on this repo's folder layout.
- **Plain Docker**, no repo needed:
  ```bash
  docker run -d --name dm-notes --restart unless-stopped \
    -p 3000:3000 -v dm-notes-data:/app/data \
    verdillian/dm-notes:latest
  ```

To upgrade either of those: pull the new image and recreate the container (`docker compose pull && docker compose up -d` for the Portainer/compose path) — the named volume keeps your data across that.

## Backups

`npm run backup` snapshots the database (a safe copy of the live file, not a raw `cp`) and uploaded images into one `.tar.gz`, then pushes it over FTP to remote storage — so you don't lose everything if the machine running this dies.

1. Fill in `BACKUP_FTP_HOST`, `BACKUP_FTP_USER`, `BACKUP_FTP_PASSWORD` in `.env` (any FTP-accessible storage works — e.g. space on a shared web hosting plan you already pay for).
2. Restart the container so it picks up the new `.env` values: `docker compose up -d`.
3. Run it once to confirm it connects and uploads successfully: `docker compose exec dm-notes npm run backup`.
4. Schedule it on the host, e.g. nightly via cron:
   ```
   0 3 * * * cd /path/to/DM-Notes && docker compose exec -T dm-notes npm run backup >> backup.log 2>&1
   ```
   (Running outside Docker instead? Use plain `npm run backup` in that cron line.)

Old backups are pruned automatically, keeping the most recent 14 by default (`BACKUP_KEEP_LAST`). If your FTP host supports FTPS, set `BACKUP_FTP_SECURE=true` so credentials and data aren't sent in the clear.

**`npm run backup:manual`** does the same safe snapshot but just saves the `.tar.gz` to a local `./backups` folder — no FTP setup needed. Use it for an on-demand backup you upload yourself, wherever you like.

**Restoring**: extract the archive and put `notes.db`, the `uploads/` folder, and `.encryption-key` back into `./data`, all three. That key file is what CalDAV passwords are encrypted with (see below) — every backup includes it automatically, but if you're restoring by hand, don't leave it behind or saved CalDAV connections will need to be reconnected.

## Stack

Next.js (App Router) + TypeScript + Tailwind CSS, `better-sqlite3` for storage, `marked` + `highlight.js` for rendering, `node-ical` + `fast-xml-parser` for CalDAV.

## Security notes

- **CalDAV credentials are encrypted at rest** (AES-256-GCM). The key lives in `data/.encryption-key`, generated automatically on first use and separate from `notes.db` — a copy of the database file alone isn't enough to read a stored password back out. Set `CALDAV_ENCRYPTION_KEY` in `.env` (64 hex characters — `openssl rand -hex 32` generates one) if you'd rather manage the key yourself instead of the auto-generated file. This protects against someone getting hold of the database file alone, not a fully compromised host, which could read the key file too — same trust boundary as everything else in a self-hosted deployment.

## Known limitations

- Editing or deleting a recurring event affects the whole series — there's no per-occurrence override yet.
- No password-reset email flow; an admin can reset any user's password from Settings instead.

---

VERDILLIAN © 2026
