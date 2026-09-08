"use client";

import { useEffect } from "react";
import { X, RotateCcw, Trash2 } from "lucide-react";

export type TrashedNote = {
  id: string;
  label: string;
  threadName: string;
  deletedAt: number;
};

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function TrashPanel({
  notes,
  loading,
  onRestore,
  onDeleteForever,
  onClose,
}: {
  notes: TrashedNote[];
  loading: boolean;
  onRestore: (id: string) => void;
  onDeleteForever: (id: string) => void;
  onClose: () => void;
}) {
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
        className="w-full max-w-md max-h-[80vh] overflow-y-auto rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-lg"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 dark:border-neutral-800">
          <h2 className="text-sm font-semibold">Trash</h2>
          <button
            onClick={onClose}
            className="p-2 -m-1 rounded-md text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {loading && <p className="px-4 py-6 text-sm text-neutral-400 text-center">Loading…</p>}

        {!loading && notes.length === 0 && (
          <p className="px-4 py-6 text-sm text-neutral-400 text-center">
            Nothing in the trash. Deleted notes stay here for 30 days.
          </p>
        )}

        {!loading && notes.length > 0 && (
          <div className="px-2 py-2">
            <p className="px-2 pb-2 text-xs text-neutral-400">
              Deleted notes are kept for 30 days before being removed for good.
            </p>
            {notes.map((n) => (
              <div
                key={n.id}
                className="flex items-start gap-2 px-2 py-2 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-800"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm truncate">{n.label}</p>
                  <p className="text-[11px] text-neutral-400">
                    {n.threadName} · deleted {formatDate(n.deletedAt)}
                  </p>
                </div>
                <button
                  onClick={() => onRestore(n.id)}
                  className="p-2 shrink-0 text-neutral-300 hover:text-brand-600"
                  title="Restore"
                >
                  <RotateCcw size={15} />
                </button>
                <button
                  onClick={() => onDeleteForever(n.id)}
                  className="p-2 shrink-0 text-neutral-300 hover:text-red-500"
                  title="Delete forever"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
