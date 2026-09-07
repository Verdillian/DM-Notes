"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Login failed");
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setError("Network error — check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-dvh flex-col items-center justify-center bg-neutral-50 dark:bg-neutral-950 px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6 space-y-4"
      >
        <div>
          <p className="text-xs font-display text-brand-600 leading-relaxed">DM NOTES</p>
          <h1 className="text-lg font-semibold">Log in</h1>
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <div className="space-y-1">
          <label className="text-sm text-neutral-500">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm text-neutral-500">Password</label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-brand-600 text-white py-2 text-sm font-medium disabled:opacity-40"
        >
          {loading ? "Logging in…" : "Log in"}
        </button>
        <p className="text-sm text-neutral-500 text-center">
          No account?{" "}
          <Link href="/register" className="text-brand-600 hover:underline">
            Register
          </Link>
        </p>
      </form>
      <p className="mt-6 text-xs text-neutral-400">VERDILLIAN — No NPCs were harmed. © 2026.</p>
    </div>
  );
}
