"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

export type EditableEvent = {
  href: string;
  summary: string;
  start: string;
  end: string;
  allDay: boolean;
  isRecurring: boolean;
  location?: string;
};

const RECURRENCE_OPTIONS = [
  { value: "", label: "No change" },
  { value: "none", label: "Doesn't repeat" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
] as const;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function toDateInput(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function toDateTimeInput(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromInputValue(value: string, allDay: boolean): string {
  if (allDay) return `${value}T00:00:00.000Z`;
  return new Date(value).toISOString();
}

export default function EditEventDialog({
  event,
  onClose,
  onSaved,
}: {
  event: EditableEvent;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [summary, setSummary] = useState(event.summary);
  const [location, setLocation] = useState(event.location ?? "");
  const [startValue, setStartValue] = useState(
    event.allDay ? toDateInput(event.start) : toDateTimeInput(event.start)
  );
  const [endValue, setEndValue] = useState(
    event.allDay ? toDateInput(event.end) : toDateTimeInput(event.end)
  );
  const [recurrence, setRecurrence] = useState<(typeof RECURRENCE_OPTIONS)[number]["value"]>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  async function handleSave() {
    if (!summary.trim()) {
      setError("Title can't be empty");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/caldav/events", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          href: event.href,
          summary,
          location,
          start: fromInputValue(startValue, event.allDay),
          end: fromInputValue(endValue, event.allDay),
          allDay: event.allDay,
          recurrence: recurrence || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Couldn't save that event.");
        return;
      }
      onSaved();
    } catch {
      setError("Network error — check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/30 p-4 pt-16 sm:pt-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-lg"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 dark:border-neutral-800">
          <h2 className="text-sm font-semibold">Edit event</h2>
          <button
            onClick={onClose}
            className="p-2 -m-1 rounded-md text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-4 py-4 space-y-3">
          {error && <p className="text-sm text-red-500">{error}</p>}
          {event.isRecurring && (
            <p className="text-xs text-neutral-400">
              This is a recurring event — changes here apply to the whole series.
            </p>
          )}

          <div className="space-y-1">
            <label className="text-sm text-neutral-500">Title</label>
            <input
              type="text"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              className="w-full rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-sm text-neutral-500">Starts</label>
              <input
                type={event.allDay ? "date" : "datetime-local"}
                value={startValue}
                onChange={(e) => setStartValue(e.target.value)}
                className="w-full rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm text-neutral-500">Ends</label>
              <input
                type={event.allDay ? "date" : "datetime-local"}
                value={endValue}
                onChange={(e) => setEndValue(e.target.value)}
                className="w-full rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm text-neutral-500">Location</label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm text-neutral-500">Repeat</label>
            <select
              value={recurrence}
              onChange={(e) => setRecurrence(e.target.value as typeof recurrence)}
              className="w-full rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              {RECURRENCE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-4 py-3 border-t border-neutral-200 dark:border-neutral-800">
          <button
            onClick={onClose}
            className="rounded-md px-3 py-2 text-sm text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-md bg-brand-600 text-white px-4 py-2 text-sm font-medium disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
