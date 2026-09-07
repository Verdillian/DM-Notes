"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, MapPin, Settings } from "lucide-react";

type CalendarEvent = {
  uid: string;
  summary: string;
  start: string;
  end: string;
  allDay: boolean;
  location?: string;
  description?: string;
};

function dayLabel(date: Date): string {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === tomorrow.toDateString()) return "Tomorrow";
  return date.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
}

function timeLabel(event: CalendarEvent): string {
  if (event.allDay) return "All day";
  const start = new Date(event.start);
  const end = new Date(event.end);
  const fmt = (d: Date) => d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return `${fmt(start)} – ${fmt(end)}`;
}

export default function CalendarPage() {
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notConnected, setNotConnected] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r : Promise.reject()))
      .then(() => {
        setCheckingAuth(false);
        return fetch("/api/caldav/events");
      })
      .then(async (r) => {
        if (!r.ok) {
          const data = await r.json().catch(() => ({}));
          if (r.status === 400) {
            setNotConnected(true);
          } else {
            setError(data.error ?? "Couldn't load your calendar.");
          }
          return;
        }
        const data: CalendarEvent[] = await r.json();
        setEvents(data);
      })
      .catch(() => router.push("/login"))
      .finally(() => setLoading(false));
  }, [router]);

  const grouped = events.reduce<Map<string, CalendarEvent[]>>((map, event) => {
    const key = new Date(event.start).toDateString();
    const list = map.get(key) ?? [];
    list.push(event);
    map.set(key, list);
    return map;
  }, new Map());

  if (checkingAuth) {
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
        <h1 className="text-lg font-semibold flex-1">Calendar</h1>
        <Link
          href="/settings"
          className="p-1.5 rounded-md text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-900"
          aria-label="Calendar settings"
        >
          <Settings size={18} />
        </Link>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6">
        {loading && <p className="text-sm text-neutral-400 text-center mt-8">Loading…</p>}

        {!loading && notConnected && (
          <div className="text-center mt-8 space-y-3">
            <p className="text-sm text-neutral-500">No calendar connected yet.</p>
            <Link
              href="/settings"
              className="inline-block rounded-md bg-brand-600 text-white px-4 py-2 text-sm font-medium"
            >
              Connect a calendar
            </Link>
          </div>
        )}

        {!loading && error && (
          <p className="text-sm text-red-500 text-center mt-8">{error}</p>
        )}

        {!loading && !notConnected && !error && events.length === 0 && (
          <p className="text-sm text-neutral-400 text-center mt-8">
            Nothing on the calendar in the next couple of months.
          </p>
        )}

        {!loading && !notConnected && !error && events.length > 0 && (
          <div className="space-y-6">
            {[...grouped.entries()].map(([dayKey, dayEvents]) => (
              <div key={dayKey}>
                <h2 className="text-xs font-semibold text-neutral-400 uppercase tracking-wide mb-2">
                  {dayLabel(new Date(dayKey))}
                </h2>
                <div className="space-y-2">
                  {dayEvents.map((event) => (
                    <div
                      key={event.uid}
                      className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-4 py-2.5"
                    >
                      <p className="text-sm font-medium">{event.summary}</p>
                      <p className="text-xs text-neutral-500 mt-0.5">{timeLabel(event)}</p>
                      {event.location && (
                        <p className="text-xs text-neutral-400 mt-0.5 flex items-center gap-1">
                          <MapPin size={11} />
                          {event.location}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
