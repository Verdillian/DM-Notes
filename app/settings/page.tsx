"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Download, Upload, LogOut, ShieldCheck } from "lucide-react";

type CurrentUser = { id: string; email: string; isAdmin: boolean };

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
    if (!user?.isAdmin) return;
    fetch("/api/admin/settings")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: { registrationOpen: boolean }) => setRegistrationOpen(data.registrationOpen))
      .catch(() => setAdminError("Couldn't load admin settings — check your connection."));
  }, [user?.isAdmin]);

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
