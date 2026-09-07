"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Download, Upload, LogOut, ShieldCheck, KeyRound } from "lucide-react";

type CurrentUser = { id: string; email: string; isAdmin: boolean };
type AdminUser = { id: string; email: string; isAdmin: boolean; createdAt: number };

export default function SettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [accountError, setAccountError] = useState<string | null>(null);
  const [accountSuccess, setAccountSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const [registrationOpen, setRegistrationOpen] = useState<boolean | null>(null);
  const [adminSaving, setAdminSaving] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [resettingUserId, setResettingUserId] = useState<string | null>(null);
  const [resetPasswordValue, setResetPasswordValue] = useState("");
  const [resetSaving, setResetSaving] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);

  const [caldavConnected, setCaldavConnected] = useState<boolean | null>(null);
  const [caldavUrl, setCaldavUrl] = useState("");
  const [caldavUsername, setCaldavUsername] = useState("");
  const [caldavPassword, setCaldavPassword] = useState("");
  const [caldavCalendars, setCaldavCalendars] = useState<string[]>([]);
  const [caldavSaving, setCaldavSaving] = useState(false);
  const [caldavError, setCaldavError] = useState<string | null>(null);
  const [caldavSuccess, setCaldavSuccess] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((me: CurrentUser) => {
        setUser(me);
        setCheckingAuth(false);
      })
      .catch(() => router.push("/login"));
  }, [router]);

  useEffect(() => {
    if (!user) return;
    fetch("/api/caldav/connection")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(
        (data: {
          connected: boolean;
          url?: string;
          username?: string;
          calendars?: string[];
          discoveryError?: string | null;
        }) => {
          setCaldavConnected(data.connected);
          if (data.connected) {
            setCaldavUrl(data.url ?? "");
            setCaldavUsername(data.username ?? "");
            setCaldavCalendars(data.calendars ?? []);
            if (data.discoveryError) setCaldavError(data.discoveryError);
          }
        }
      )
      .catch(() => setCaldavConnected(false));
  }, [user]);

  async function handleCaldavConnect(e: FormEvent) {
    e.preventDefault();
    setCaldavError(null);
    setCaldavSuccess(null);
    setCaldavSaving(true);
    try {
      const res = await fetch("/api/caldav/connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: caldavUrl, username: caldavUsername, password: caldavPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCaldavError(data.error ?? "Couldn't connect to that calendar.");
        return;
      }
      setCaldavConnected(true);
      setCaldavPassword("");
      setCaldavCalendars(data.calendars ?? []);
      const count = (data.calendars ?? []).length;
      setCaldavSuccess(count === 1 ? "Connected — found 1 calendar." : `Connected — found ${count} calendars.`);
    } catch {
      setCaldavError("Network error — check your connection and try again.");
    } finally {
      setCaldavSaving(false);
    }
  }

  async function handleCaldavDisconnect() {
    setCaldavSaving(true);
    setCaldavError(null);
    try {
      await fetch("/api/caldav/connection", { method: "DELETE" });
      setCaldavConnected(false);
      setCaldavUrl("");
      setCaldavUsername("");
      setCaldavPassword("");
      setCaldavCalendars([]);
      setCaldavSuccess(null);
    } catch {
      setCaldavError("Network error — check your connection and try again.");
    } finally {
      setCaldavSaving(false);
    }
  }

  useEffect(() => {
    if (!user?.isAdmin) return;
    fetch("/api/admin/settings")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: { registrationOpen: boolean }) => setRegistrationOpen(data.registrationOpen))
      .catch(() => setAdminError("Couldn't load admin settings — check your connection."));
    fetch("/api/admin/users")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: AdminUser[]) => setUsers(data))
      .catch(() => setAdminError("Couldn't load the user list — check your connection."));
  }, [user?.isAdmin]);

  function startResetPassword(id: string) {
    setResettingUserId(id);
    setResetPasswordValue("");
    setResetMessage(null);
    setResetError(null);
  }

  async function handleResetPassword(id: string) {
    if (resetPasswordValue.length < 8) {
      setResetError("New password must be at least 8 characters");
      return;
    }
    setResetSaving(true);
    setResetError(null);
    try {
      const res = await fetch(`/api/admin/users/${id}/password`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword: resetPasswordValue }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setResetError(data.error ?? "Couldn't reset that password.");
        return;
      }
      setResettingUserId(null);
      setResetPasswordValue("");
      setResetMessage("Password reset.");
    } catch {
      setResetError("Network error — check your connection and try again.");
    } finally {
      setResetSaving(false);
    }
  }

  async function handleAccountSubmit(e: FormEvent) {
    e.preventDefault();
    setAccountError(null);
    setAccountSuccess(null);

    if (!newEmail.trim() && !newPassword) {
      setAccountError("Change your email, password, or both.");
      return;
    }
    if (newPassword && newPassword !== confirmPassword) {
      setAccountError("New passwords don't match.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword,
          newEmail: newEmail.trim() || undefined,
          newPassword: newPassword || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setAccountError(data.error ?? "Update failed");
        return;
      }
      const updated = await res.json();
      setUser(updated);
      setCurrentPassword("");
      setNewEmail("");
      setNewPassword("");
      setConfirmPassword("");
      setAccountSuccess("Saved.");
    } catch {
      setAccountError("Network error — check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleExport() {
    setExportError(null);
    try {
      const res = await fetch("/api/export");
      if (!res.ok) {
        setExportError("Export failed — check your connection and try again.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="([^"]+)"/);
      a.download = match?.[1] ?? "notes-backup.json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setExportError("Network error — check your connection and try again.");
    }
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImportMessage(null);
    setImportError(null);
    try {
      const text = await file.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        setImportError("That file isn't valid JSON.");
        return;
      }
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setImportError(data.error ?? "Import failed");
        return;
      }
      const summary = await res.json();
      setImportMessage(
        `Imported ${summary.threadsImported} thread(s), ${summary.notesImported} note(s).`
      );
    } catch {
      setImportError("Network error — check your connection and try again.");
    }
  }

  async function handleToggleRegistration() {
    if (registrationOpen === null) return;
    const next = !registrationOpen;
    setAdminSaving(true);
    setAdminError(null);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrationOpen: next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setAdminError(data.error ?? "Couldn't update that setting.");
        return;
      }
      setRegistrationOpen(next);
    } catch {
      setAdminError("Network error — check your connection and try again.");
    } finally {
      setAdminSaving(false);
    }
  }

  async function handleLogout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // ignore — we're navigating to /login regardless
    }
    router.push("/login");
  }

  if (checkingAuth || !user) {
    return (
      <div className="flex h-dvh items-center justify-center bg-neutral-50 dark:bg-neutral-950">
        <p className="text-sm text-neutral-400">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-neutral-50 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100">
      <header className="border-b border-neutral-200 dark:border-neutral-800 px-4 py-3 flex items-center gap-3">
        <Link
          href="/"
          className="p-1.5 -ml-1.5 rounded-md text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-900"
          aria-label="Back to notes"
        >
          <ArrowLeft size={18} />
        </Link>
        <h1 className="text-lg font-semibold">Settings</h1>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-8">
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wide">
            Account
          </h2>
          <p className="text-sm text-neutral-500">
            Signed in as{" "}
            <span className="font-medium text-neutral-700 dark:text-neutral-300">
              {user.email}
            </span>
            {user.isAdmin && (
              <span className="ml-2 inline-flex items-center gap-1 text-xs text-brand-600">
                <ShieldCheck size={12} /> admin
              </span>
            )}
          </p>
          <form onSubmit={handleAccountSubmit} className="space-y-3">
            {accountError && <p className="text-sm text-red-500">{accountError}</p>}
            {accountSuccess && <p className="text-sm text-brand-600">{accountSuccess}</p>}

            <div className="space-y-1">
              <label className="text-sm text-neutral-500">Current password</label>
              <input
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Required to make any change"
                className="w-full rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm text-neutral-500">New email</label>
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder={user.email}
                className="w-full rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm text-neutral-500">New password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Leave blank to keep current"
                  className="w-full rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm text-neutral-500">Confirm new password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-brand-600 text-white px-4 py-2 text-sm font-medium disabled:opacity-40"
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
          </form>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wide">
            Backup
          </h2>
          <p className="text-sm text-neutral-500">
            Export everything to a JSON file, or import a backup — imports are merged in
            without touching what&apos;s already here.
          </p>
          {importMessage && <p className="text-sm text-brand-600">{importMessage}</p>}
          {importError && <p className="text-sm text-red-500">{importError}</p>}
          {exportError && <p className="text-sm text-red-500">{exportError}</p>}
          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleExport}
              className="inline-flex items-center gap-2 rounded-md border border-neutral-300 dark:border-neutral-700 px-3 py-2 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-900"
            >
              <Download size={16} />
              Export backup
            </button>
            <button
              onClick={() => importInputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-md border border-neutral-300 dark:border-neutral-700 px-3 py-2 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-900"
            >
              <Upload size={16} />
              Import backup
            </button>
            <input
              ref={importInputRef}
              type="file"
              accept="application/json"
              onChange={handleImportFile}
              className="hidden"
            />
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wide">
            Calendar
          </h2>
          <p className="text-sm text-neutral-500">
            Connect a CalDAV calendar to see upcoming events alongside your notes. Read-only —
            nothing here can create or change events on your server.
          </p>
          {caldavError && <p className="text-sm text-red-500">{caldavError}</p>}
          {caldavSuccess && <p className="text-sm text-brand-600">{caldavSuccess}</p>}
          {caldavConnected && (
            <div className="text-sm text-neutral-500 space-y-1">
              <p>
                Connected to{" "}
                <span className="font-medium text-neutral-700 dark:text-neutral-300">{caldavUrl}</span>{" "}
                as {caldavUsername}.
              </p>
              {caldavCalendars.length > 0 && (
                <p>
                  Calendars found:{" "}
                  <span className="font-medium text-neutral-700 dark:text-neutral-300">
                    {caldavCalendars.join(", ")}
                  </span>
                </p>
              )}
            </div>
          )}
          <form onSubmit={handleCaldavConnect} className="space-y-3">
            <div className="space-y-1">
              <label className="text-sm text-neutral-500">Server URL</label>
              <input
                type="url"
                required
                value={caldavUrl}
                onChange={(e) => setCaldavUrl(e.target.value)}
                placeholder="https://caldav.example.com/dav.php"
                className="w-full rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm text-neutral-500">Username</label>
                <input
                  type="text"
                  required
                  autoCapitalize="off"
                  autoCorrect="off"
                  autoComplete="off"
                  spellCheck={false}
                  value={caldavUsername}
                  onChange={(e) => setCaldavUsername(e.target.value)}
                  className="w-full rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm text-neutral-500">Password</label>
                <input
                  type="password"
                  required={!caldavConnected}
                  autoCapitalize="off"
                  autoCorrect="off"
                  autoComplete="new-password"
                  spellCheck={false}
                  value={caldavPassword}
                  onChange={(e) => setCaldavPassword(e.target.value)}
                  placeholder={caldavConnected ? "Leave blank to keep current" : ""}
                  className="w-full rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={caldavSaving}
                className="rounded-md bg-brand-600 text-white px-4 py-2 text-sm font-medium disabled:opacity-40"
              >
                {caldavSaving ? "Connecting…" : caldavConnected ? "Reconnect" : "Connect"}
              </button>
              {caldavConnected && (
                <button
                  type="button"
                  onClick={handleCaldavDisconnect}
                  disabled={caldavSaving}
                  className="rounded-md border border-neutral-300 dark:border-neutral-700 px-4 py-2 text-sm text-red-500 disabled:opacity-40"
                >
                  Disconnect
                </button>
              )}
            </div>
          </form>
        </section>

        {user.isAdmin && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wide">
              Admin
            </h2>
            {adminError && <p className="text-sm text-red-500">{adminError}</p>}
            <label className="flex items-center justify-between gap-3 rounded-lg border border-neutral-200 dark:border-neutral-800 px-3 py-2.5">
              <span className="text-sm">
                Allow new accounts to register
                <span className="block text-xs text-neutral-400">
                  When off, only existing accounts can log in.
                </span>
              </span>
              <input
                type="checkbox"
                checked={registrationOpen ?? false}
                disabled={registrationOpen === null || adminSaving}
                onChange={handleToggleRegistration}
                className="h-5 w-5 accent-brand-600 shrink-0"
              />
            </label>

            <div className="space-y-1.5">
              <p className="text-xs font-medium text-neutral-500">Users</p>
              {resetMessage && <p className="text-sm text-brand-600">{resetMessage}</p>}
              <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 divide-y divide-neutral-200 dark:divide-neutral-800">
                {users.map((u) => (
                  <div key={u.id} className="px-3 py-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm truncate">
                        {u.email}
                        {u.isAdmin && (
                          <span className="ml-2 text-xs text-brand-600">admin</span>
                        )}
                      </span>
                      <button
                        onClick={() =>
                          resettingUserId === u.id
                            ? setResettingUserId(null)
                            : startResetPassword(u.id)
                        }
                        className="inline-flex items-center gap-1.5 shrink-0 text-xs text-neutral-500 hover:text-brand-600"
                      >
                        <KeyRound size={13} />
                        Reset password
                      </button>
                    </div>
                    {resettingUserId === u.id && (
                      <div className="mt-2 flex items-center gap-2">
                        <input
                          type="password"
                          autoFocus
                          value={resetPasswordValue}
                          onChange={(e) => setResetPasswordValue(e.target.value)}
                          placeholder="New password (min 8 characters)"
                          className="flex-1 rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                        />
                        <button
                          onClick={() => handleResetPassword(u.id)}
                          disabled={resetSaving}
                          className="rounded-md bg-brand-600 text-white px-3 py-1.5 text-xs font-medium disabled:opacity-40"
                        >
                          Set
                        </button>
                      </div>
                    )}
                    {resettingUserId === u.id && resetError && (
                      <p className="mt-1 text-xs text-red-500">{resetError}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wide">
            Session
          </h2>
          <button
            onClick={handleLogout}
            className="inline-flex items-center gap-2 rounded-md border border-neutral-300 dark:border-neutral-700 px-3 py-2 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-950"
          >
            <LogOut size={16} />
            Log out
          </button>
        </section>

        <p className="text-xs text-neutral-400 pt-4">VERDILLIAN — No NPCs were harmed. © 2026.</p>
      </main>
    </div>
  );
}
