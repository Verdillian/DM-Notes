"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

type Entry = { label: string; syntax: string };

const ENTRIES: Entry[] = [
  { label: "Bold", syntax: "**text**" },
  { label: "Italic", syntax: "*text*" },
  { label: "Strikethrough", syntax: "~~text~~" },
  { label: "Inline code", syntax: "`text`" },
  { label: "Code block", syntax: "```lang\ncode\n```" },
  { label: "Heading", syntax: "# text" },
  { label: "Quote", syntax: "> text" },
  { label: "Divider", syntax: "---" },
  { label: "Table row", syntax: "| a | b |" },
  { label: "Tag", syntax: "#tag" },
  { label: "Link a note", syntax: "[[ then pick from the list" },
  { label: "Checklist", syntax: "- [ ] task" },
  { label: "Image", syntax: "attach icon, or paste a screenshot" },
  { label: "New line, same note", syntax: "Shift + Enter" },
];

export default function FormattingHelp({ onClose }: { onClose: () => void }) {
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
          <h2 className="text-sm font-semibold">Formatting quick reference</h2>
          <button
            onClick={onClose}
            className="p-2 -m-1 rounded-md text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>
        <div className="px-4 py-2">
          {ENTRIES.map((e) => (
            <div
              key={e.label}
              className="flex items-center justify-between gap-3 py-2 border-b border-neutral-100 dark:border-neutral-800 last:border-0"
            >
              <span className="text-sm text-neutral-500 shrink-0">{e.label}</span>
              <code className="text-xs font-mono text-right rounded bg-neutral-100 dark:bg-neutral-800 px-1.5 py-1 whitespace-pre-wrap break-words">
                {e.syntax}
              </code>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
