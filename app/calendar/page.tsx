"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ChevronLeft, ChevronRight, MapPin, Pencil, Settings } from "lucide-react";
import EditEventDialog from "@/components/EditEventDialog";

type CalendarEvent = {
  uid: string;
  href: string;
  summary: string;
  start: string;
  end: string;
  allDay: boolean;
  location?: string;
  description?: string;
};

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, n: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + n, 1);
}

function startOfGrid(monthStart: Date): Date {
  const d = new Date(monthStart);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

function sameDay(a: Date, b: Date): boolean {
  return a.toDateString() === b.toDateString();
}

function timeLabel(event: CalendarEvent): string {
  if (event.allDay) return "All day";
  const fmt = (d: Date) => d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return `${fmt(new Date(event.start))} – ${fmt(new Date(event.end))}`;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const GRID_DAYS = 42; // 6 weeks, always enough to cover any month

export default function CalendarPage() {
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [monthStart, setMonthStart] = useState(() => startOfMonth(new Date()));
  const [selectedDay, setSelectedDay] = useState(() => new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notConnected, setNotConnected] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? undefined : Promise.reject()))
      .then(() => setCheckingAuth(false))
      .catch(() => router.push("/login"));
  }, [router]);

  const gridStart = useMemo(() => startOfGrid(monthStart), [monthStart]);
  const gridDays = useMemo(
    () =>
      Array.from({ length: GRID_DAYS }, (_, i) => {
        const d = new Date(gridStart);
        d.setDate(d.getDate() + i);
        return d;
      }),
    [gridStart]
  );
  const gridEnd = gridDays[gridDays.length - 1];

  useEffect(() => {
    if (checkingAuth) return;
    let cancelled = false;

    async function loadEvents() {
      setLoading(true);
      setError(null);
      setNotConnected(false);
      const start = gridStart.toISOString();
      const end = new Date(gridEnd.getTime() + 24 * 60 * 60 * 1000).toISOString();
      try {
        const r = await fetch(
          `/api/caldav/events?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`
        );
        if (cancelled) return;
        if (!r.ok) {
          const data = await r.json().catch(() => ({}));
          if (cancelled) return;
          if (r.status === 400 && data.error === "No calendar connected yet") {
            setNotConnected(true);
          } else {
            setError(data.error ?? "Couldn't load your calendar.");
          }
          return;
        }
        const data: CalendarEvent[] = await r.json();
        if (!cancelled) setEvents(data);
      } catch {
        if (!cancelled) {
          setError("Couldn't reach the server — check your connection and try again.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadEvents();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkingAuth, gridStart.getTime(), gridEnd.getTime(), reloadToken]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of events) {
      const key = new Date(event.start).toDateString();
      const list = map.get(key) ?? [];
      list.push(event);
      map.set(key, list);
    }
    return map;
  }, [events]);

  const today = new Date();
  const selectedEvents = eventsByDay.get(selectedDay.toDateString()) ?? [];

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

      <main className="max-w-2xl mx-auto px-3 sm:px-4 py-4 sm:py-6">
        {notConnected && (
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

        {!notConnected && error && (
          <p className="text-sm text-red-500 text-center mt-8">{error}</p>
        )}

        {!notConnected && !error && (
          <>
            <div className="flex items-center justify-between mb-3">
              <button
                onClick={() => setMonthStart((m) => addMonths(m, -1))}
                className="p-2.5 -m-1 rounded-md text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-900"
                aria-label="Previous month"
              >
                <ChevronLeft size={18} />
              </button>
              <div className="flex items-center gap-3">
                <h2 className="text-base font-semibold">
                  {monthStart.toLocaleDateString([], { month: "long", year: "numeric" })}
                </h2>
                <button
                  onClick={() => {
                    setMonthStart(startOfMonth(new Date()));
                    setSelectedDay(new Date());
                  }}
                  className="text-xs text-brand-600 hover:underline"
                >
                  Today
                </button>
              </div>
              <button
                onClick={() => setMonthStart((m) => addMonths(m, 1))}
                className="p-2.5 -m-1 rounded-md text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-900"
                aria-label="Next month"
              >
                <ChevronRight size={18} />
              </button>
            </div>

            <div className="grid grid-cols-7 text-center text-[11px] font-medium text-neutral-400 mb-1">
              {WEEKDAYS.map((d) => (
                <div key={d}>{d}</div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {gridDays.map((day) => {
                const inMonth = day.getMonth() === monthStart.getMonth();
                const isToday = sameDay(day, today);
                const isSelected = sameDay(day, selectedDay);
                const dayEvents = eventsByDay.get(day.toDateString()) ?? [];
                return (
                  <button
                    key={day.toISOString()}
                    onClick={() => setSelectedDay(day)}
                    className={`aspect-square rounded-lg flex flex-col items-center justify-start pt-1.5 gap-1 text-sm ${
                      isSelected
                        ? "bg-brand-600 text-white"
                        : isToday
                          ? "bg-brand-100 dark:bg-brand-900"
                          : "hover:bg-neutral-100 dark:hover:bg-neutral-900"
                    } ${!inMonth && !isSelected ? "text-neutral-300 dark:text-neutral-700" : ""}`}
                  >
                    <span>{day.getDate()}</span>
                    {dayEvents.length > 0 && (
                      <span className="flex gap-0.5">
                        {dayEvents.slice(0, 3).map((e) => (
                          <span
                            key={e.uid}
                            className={`h-1 w-1 rounded-full ${
                              isSelected ? "bg-white" : "bg-brand-500"
                            }`}
                          />
                        ))}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="mt-6 space-y-2">
              <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wide">
                {sameDay(selectedDay, today)
                  ? "Today"
                  : selectedDay.toLocaleDateString([], {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                    })}
              </h3>
              {loading && <p className="text-sm text-neutral-400">Loading…</p>}
              {!loading && selectedEvents.length === 0 && (
                <p className="text-sm text-neutral-400">Nothing on the calendar.</p>
              )}
              {!loading &&
                selectedEvents.map((event) => (
                  <div
                    key={event.uid}
                    className="group flex items-start justify-between gap-2 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-4 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{event.summary}</p>
                      <p className="text-xs text-neutral-500 mt-0.5">{timeLabel(event)}</p>
                      {event.location && (
                        <p className="text-xs text-neutral-400 mt-0.5 flex items-center gap-1">
                          <MapPin size={11} />
                          {event.location}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => setEditingEvent(event)}
                      className="p-2 -m-1 shrink-0 text-neutral-300 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 hover:text-brand-600"
                      aria-label="Edit event"
                    >
                      <Pencil size={14} />
                    </button>
                  </div>
                ))}
            </div>
          </>
        )}
      </main>

      {editingEvent && (
        <EditEventDialog
          event={editingEvent}
          onClose={() => setEditingEvent(null)}
          onSaved={() => {
            setEditingEvent(null);
            setReloadToken((t) => t + 1);
          }}
        />
      )}
    </div>
  );
}
