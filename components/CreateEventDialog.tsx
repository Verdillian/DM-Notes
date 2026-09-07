"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

type Calendar = { url: string; name: string };

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function toDateInput(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toDateTimeInput(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromInputValue(value: string, allDay: boolean): string {
  if (allDay) return `${value}T00:00:00.000Z`;
  return new Date(value).toISOString();
}

export default function CreateEventDialog({
  defaultDay,
  onClose,
  onCreated,
}: {
  defaultDay: Date;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const [calendarUrl, setCalendarUrl] = useState("");
  const [loadingCalendars, setLoadingCalendars] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [summary, setSummary] = useState("");
  const [location, setLocation] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [recurrence, setRecurrence] = useState<"" | "daily" | "weekly" | "monthly" | "yearly">("");

  const initialStart = new Date(defaultDay);
  initialStart.setHours(initialStart.getHours() + 1, 0, 0, 0);
  const initialEnd = new Date(initialStart);
  initialEnd.setHours(initialEnd.getHours() + 1);

  const [startValue, setStartValue] = useState(toDateTimeInput(initialStart));
  const [endValue, setEndValue] = useState(toDateTimeInput(initialEnd));

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/caldav/calendars")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: Calendar[]) => {
        setCalendars(data);
        if (data[0]) setCalendarUrl(data[0].url);
      })
      .catch(() => setLoadError("Couldn't load your calendars — check your connection."))
      .finally(() => setLoadingCalendars(false));
  }, []);

  function handleAllDayToggle(checked: boolean) {
    setAllDay(checked);
    if (checked) {
      setStartValue(toDateInput(defaultDay));
      setEndValue(toDateInput(defaultDay));
    } else {
      setStartValue(toDateTimeInput(initialStart));
      setEndValue(toDateTimeInput(initialEnd));
    }
  }

  async function handleCreate() {
    if (!summary.trim()) {
      setError("Title can't be empty");
      return;
    }
    if (!calendarUrl) {
      setError(
        calendars.length === 0
          ? "No calendars found on your server — nothing to create this event in."
          : "Pick a calendar"
      );
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/caldav/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          calendarUrl,
          summary,
          location,
          start: fromInputValue(startValue, allDay),
          end: fromInputValue(endValue, allDay),
          allDay,
          recurrence: recurrence || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Couldn't create that event.");
        return;
      }
      onCreated();
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
          <h2 className="text-sm font-semibold">New event</h2>
          <button
            onClick={onClose}
            className="p-2 -m-1 rounded-md text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-4 py-4 space-y-3">
          {loadError && <p className="text-sm text-red-500">{loadError}</p>}
          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="space-y-1">
            <label className="text-sm text-neutral-500">Title</label>
            <input
              type="text"
              autoFocus
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              className="w-full rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          {calendars.length > 1 && (
            <div className="space-y-1">
              <label className="text-sm text-neutral-500">Calendar</label>
              <select
                value={calendarUrl}
                onChange={(e) => setCalendarUrl(e.target.value)}
                disabled={loadingCalendars}
                className="w-full rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                {calendars.map((c) => (
                  <option key={c.url} value={c.url}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm text-neutral-500">
              <input
                type="checkbox"
                checked={allDay}
                onChange={(e) => handleAllDayToggle(e.target.checked)}
                className="accent-brand-600"
              />
              All day
            </label>
            <select
              value={recurrence}
              onChange={(e) => setRecurrence(e.target.value as typeof recurrence)}
              className="rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">Doesn&apos;t repeat</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-sm text-neutral-500">Starts</label>
              <input
                type={allDay ? "date" : "datetime-local"}
                value={startValue}
                onChange={(e) => setStartValue(e.target.value)}
                className="w-full rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm text-neutral-500">Ends</label>
              <input
                type={allDay ? "date" : "datetime-local"}
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
        </div>

        <div className="flex justify-end gap-2 px-4 py-3 border-t border-neutral-200 dark:border-neutral-800">
          <button
            onClick={onClose}
            className="rounded-md px-3 py-2 text-sm text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={saving || loadingCalendars}
            className="rounded-md bg-brand-600 text-white px-4 py-2 text-sm font-medium disabled:opacity-40"
          >
            {saving ? "Creating…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
