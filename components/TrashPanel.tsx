"use client";

import { useEffect, useState } from "react";
import { X, RotateCcw, Trash2 } from "lucide-react";
import Markdown from "@/components/Markdown";
import Tooltip from "@/components/Tooltip";

export type TrashedNote = {
  id: string;
  content: string;
  threadName: string;
  deletedAt: number;
};

export type TrashedThread = {
  id: string;
  name: string;
  noteCount: number;
  deletedAt: number;
};

function noop() {}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function TrashPanel({
  notes,
  loading,
  onRestore,
  onDeleteForever,
  threads,
  threadsLoading,
  onRestoreThread,
  onDeleteThreadForever,
  onClose,
}: {
  notes: TrashedNote[];
  loading: boolean;
  onRestore: (id: string) => void;
  onDeleteForever: (id: string) => void;
  threads: TrashedThread[];
  threadsLoading: boolean;
  onRestoreThread: (id: string) => void;
  onDeleteThreadForever: (id: string) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"notes" | "threads">("notes");

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/30 p-4 pt-16 sm:pt-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-lg"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 shrink-0">
          <h2 className="text-sm font-semibold">Trash</h2>
          <Tooltip label="Close">
            <button
              onClick={onClose}
              className="p-2 -m-1 rounded-md text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </Tooltip>
        </div>

        <div className="flex gap-1 px-3 sm:px-4 pt-3 shrink-0">
          {(["notes", "threads"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={
                tab === t
                  ? "rounded-md bg-brand-100 dark:bg-brand-900 text-brand-600 px-3 py-1.5 text-xs font-medium"
                  : "rounded-md px-3 py-1.5 text-xs font-medium text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              }
            >
              {t === "notes" ? "Notes" : "Threads"}
            </button>
          ))}
        </div>

        {tab === "notes" ? (
          <>
            {loading && (
              <p className="px-4 py-6 text-sm text-neutral-400 text-center">Loading…</p>
            )}
            {!loading && notes.length === 0 && (
              <p className="px-4 py-6 text-sm text-neutral-400 text-center">
                Nothing in the trash. Deleted notes stay here for 30 days.
              </p>
            )}
            {!loading && notes.length > 0 && (
              <div className="overflow-y-auto px-3 sm:px-4 py-3 flex flex-col gap-3">
                <p className="text-xs text-neutral-400">
                  Deleted notes are kept for 30 days before being removed for good.
                </p>
                {notes.map((n) => (
                  <div
                    key={n.id}
                    className="group relative max-w-2xl self-start w-full rounded-2xl rounded-tl-sm border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-4 py-2.5 shadow-[var(--bubble-shadow)]"
                  >
                    <Markdown content={n.content} onTagClick={noop} onLinkClick={noop} />
                    <div className="mt-1 flex items-center justify-between">
                      <span className="text-[11px] text-brand-600">{n.threadName}</span>
                      <div className="flex items-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity -mr-2">
                        <Tooltip label="Restore">
                          <button
                            onClick={() => onRestore(n.id)}
                            className="p-2.5 text-neutral-300 hover:text-brand-600"
                          >
                            <RotateCcw size={15} />
                          </button>
                        </Tooltip>
                        <Tooltip label="Delete forever">
                          <button
                            onClick={() => onDeleteForever(n.id)}
                            className="p-2.5 text-neutral-300 hover:text-red-500"
                          >
                            <Trash2 size={15} />
                          </button>
                        </Tooltip>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            {threadsLoading && (
              <p className="px-4 py-6 text-sm text-neutral-400 text-center">Loading…</p>
            )}
            {!threadsLoading && threads.length === 0 && (
              <p className="px-4 py-6 text-sm text-neutral-400 text-center">
                Nothing in the trash. Deleted threads stay here for 30 days.
              </p>
            )}
            {!threadsLoading && threads.length > 0 && (
              <div className="overflow-y-auto px-3 sm:px-4 py-3">
                <p className="px-1 pb-2 text-xs text-neutral-400">
                  Deleted threads (and the notes they held) are kept for 30 days before
                  being removed for good.
                </p>
                {threads.map((t) => (
                  <div
                    key={t.id}
                    className="group flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-800"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm truncate">{t.name}</p>
                      <p className="text-[11px] text-neutral-400">
                        {t.noteCount} note{t.noteCount === 1 ? "" : "s"} · deleted{" "}
                        {formatDate(t.deletedAt)}
                      </p>
                    </div>
                    <Tooltip label="Restore">
                      <button
                        onClick={() => onRestoreThread(t.id)}
                        className="p-2 shrink-0 text-neutral-300 hover:text-brand-600"
                      >
                        <RotateCcw size={15} />
                      </button>
                    </Tooltip>
                    <Tooltip label="Delete forever">
                      <button
                        onClick={() => onDeleteThreadForever(t.id)}
                        className="p-2 shrink-0 text-neutral-300 hover:text-red-500"
                      >
                        <Trash2 size={15} />
                      </button>
                    </Tooltip>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
