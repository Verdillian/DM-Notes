"use client";

import { useEffect } from "react";
import { X, RotateCcw, Trash2 } from "lucide-react";
import Markdown from "@/components/Markdown";

export type TrashedNote = {
  id: string;
  content: string;
  threadName: string;
  deletedAt: number;
};

function noop() {}

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
        className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-lg"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 shrink-0">
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
          <div className="overflow-y-auto px-3 sm:px-4 py-3 flex flex-col gap-3">
            <p className="text-xs text-neutral-400">
              Deleted notes are kept for 30 days before being removed for good.
            </p>
            {notes.map((n) => (
              <div
                key={n.id}
                className="group relative max-w-2xl self-start w-full rounded-2xl rounded-tl-sm border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-4 py-2.5"
              >
                <Markdown content={n.content} onTagClick={noop} onLinkClick={noop} />
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-[11px] text-brand-600">{n.threadName}</span>
                  <div className="flex items-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity -mr-2">
                    <button
                      onClick={() => onRestore(n.id)}
                      className="p-2.5 text-neutral-300 hover:text-brand-600"
                      title="Restore"
                    >
                      <RotateCcw size={15} />
                    </button>
                    <button
                      onClick={() => onDeleteForever(n.id)}
                      className="p-2.5 text-neutral-300 hover:text-red-500"
                      title="Delete forever"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
