"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, Hash } from "lucide-react";

type SwitcherThread = { id: string; name: string };
type SwitcherNote = { id: string; label: string; threadName: string };

type Result =
  | { type: "thread"; id: string; label: string }
  | { type: "note"; id: string; label: string; threadName: string };

export default function QuickSwitcher({
  threads,
  notes,
  onSelectThread,
  onSelectNote,
  onClose,
}: {
  threads: SwitcherThread[];
  notes: SwitcherNote[];
  onSelectThread: (id: string) => void;
  onSelectNote: (id: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [selIndex, setSelIndex] = useState(0);

  const results = useMemo<Result[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return threads.map((t) => ({ type: "thread" as const, id: t.id, label: t.name }));
    }
    const threadResults: Result[] = threads
      .filter((t) => t.name.toLowerCase().includes(q))
      .slice(0, 8)
      .map((t) => ({ type: "thread" as const, id: t.id, label: t.name }));
    const noteResults: Result[] = notes
      .filter((n) => n.label.toLowerCase().includes(q))
      .slice(0, 20)
      .map((n) => ({
        type: "note" as const,
        id: n.id,
        label: n.label,
        threadName: n.threadName,
      }));
    return [...threadResults, ...noteResults];
  }, [query, threads, notes]);

  function select(r: Result) {
    if (r.type === "thread") onSelectThread(r.id);
    else onSelectNote(r.id);
    onClose();
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelIndex((i) => Math.min(i + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const r = results[selIndex];
        if (r) select(r);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results, selIndex]);

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 p-4 pt-16 sm:pt-24"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-lg overflow-hidden"
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-neutral-200 dark:border-neutral-800">
          <Search size={16} className="text-neutral-400 shrink-0" />
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelIndex(0);
            }}
            placeholder="Jump to a thread or note…"
            className="flex-1 bg-transparent text-sm focus:outline-none"
          />
        </div>
        <div className="max-h-80 overflow-y-auto">
          {results.length === 0 && (
            <p className="px-4 py-6 text-sm text-neutral-400 text-center">No matches.</p>
          )}
          {results.map((r, i) => (
            <button
              key={`${r.type}-${r.id}`}
              onClick={() => select(r)}
              onMouseEnter={() => setSelIndex(i)}
              className={`flex w-full items-start gap-2 px-4 py-2.5 text-left text-sm ${
                i === selIndex
                  ? "bg-brand-50 dark:bg-brand-950"
                  : "hover:bg-neutral-50 dark:hover:bg-neutral-800"
              }`}
            >
              {r.type === "thread" ? (
                <Hash size={14} className="mt-0.5 shrink-0 text-neutral-400" />
              ) : (
                <span className="mt-0.5 shrink-0 text-[10px] font-medium uppercase text-brand-600 w-14 truncate">
                  {r.threadName}
                </span>
              )}
              <span className="truncate">{r.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
