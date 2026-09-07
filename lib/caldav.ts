import { XMLParser } from "fast-xml-parser";
import ical, { type CalendarResponse, type VEvent } from "node-ical";
import { randomUUID } from "crypto";

export type CalendarEvent = {
  uid: string;
  href: string;
  etag?: string;
  calendarName: string;
  summary: string;
  start: string;
  end: string;
  allDay: boolean;
  location?: string;
  description?: string;
};

export type CaldavCreds = { url: string; username: string; password: string };

const xmlParser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true });

function authHeader(username: string, password: string): string {
  return "Basic " + Buffer.from(`${username}:${password}`).toString("base64");
}

async function davRequest(
  url: string,
  method: string,
  creds: CaldavCreds,
  body: string | undefined,
  depth: string | undefined,
  extraHeaders?: Record<string, string>
): Promise<{ status: number; text: string; etag: string | null }> {
  const headers: Record<string, string> = {
    Authorization: authHeader(creds.username, creds.password),
    ...extraHeaders,
  };
  if (depth !== undefined) headers.Depth = depth;
  if (body !== undefined && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/xml; charset=utf-8";
  }
  const res = await fetch(url, { method, headers, body });
  const text = await res.text();
  return { status: res.status, text, etag: res.headers.get("etag") };
}

/** Recursively collects every value for a given (namespace-stripped) tag name. */
function findAll(obj: unknown, key: string, results: unknown[] = []): unknown[] {
  if (obj && typeof obj === "object") {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (k === key) {
        if (Array.isArray(v)) results.push(...v);
        else results.push(v);
      } else {
        findAll(v, key, results);
      }
    }
  }
  return results;
}

/** node-ical wraps a property in {val, params} when it carries ICS parameters. */
function unwrapValue(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value === "string") return value;
  if (typeof value === "object" && "val" in value) {
    return String((value as { val: unknown }).val);
  }
  return String(value);
}

function textOf(node: unknown): string | undefined {
  if (typeof node === "string") return node;
  if (node && typeof node === "object" && "#text" in node) {
    return String((node as Record<string, unknown>)["#text"]);
  }
  return undefined;
}

function resolveUrl(base: string, href: string): string {
  return new URL(href, base).toString();
}

const PRINCIPAL_PROPFIND = `<?xml version="1.0" encoding="utf-8"?>
<D:propfind xmlns:D="DAV:">
  <D:prop><D:current-user-principal/></D:prop>
</D:propfind>`;

const HOMESET_PROPFIND = `<?xml version="1.0" encoding="utf-8"?>
<D:propfind xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop><C:calendar-home-set/></D:prop>
</D:propfind>`;

const CALENDARS_PROPFIND = `<?xml version="1.0" encoding="utf-8"?>
<D:propfind xmlns:D="DAV:">
  <D:prop>
    <D:resourcetype/>
    <D:displayname/>
  </D:prop>
</D:propfind>`;

function calendarQueryReport(start: Date, end: Date): string {
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  return `<?xml version="1.0" encoding="utf-8"?>
<C:calendar-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop>
    <D:getetag/>
    <C:calendar-data/>
  </D:prop>
  <C:filter>
    <C:comp-filter name="VCALENDAR">
      <C:comp-filter name="VEVENT">
        <C:time-range start="${fmt(start)}" end="${fmt(end)}"/>
      </C:comp-filter>
    </C:comp-filter>
  </C:filter>
</C:calendar-query>`;
}

export type DiscoveredCalendar = { url: string; name: string };

export async function discoverCalendars(creds: CaldavCreds): Promise<DiscoveredCalendar[]> {
  const principalRes = await davRequest(creds.url, "PROPFIND", creds, PRINCIPAL_PROPFIND, "0");
  if (principalRes.status === 401 || principalRes.status === 403) {
    throw new Error("Authentication failed — check the username and password.");
  }
  if (principalRes.status >= 400) {
    throw new Error(`Server returned ${principalRes.status} for the calendar URL — check it's correct.`);
  }
  const principalXml = xmlParser.parse(principalRes.text);
  const principalHref = textOf(
    findAll(principalXml, "current-user-principal").flatMap((p) => findAll(p, "href"))[0]
  );
  if (!principalHref) {
    throw new Error("Couldn't find your CalDAV principal — is this the right server URL?");
  }
  const principalUrl = resolveUrl(creds.url, principalHref);

  const homeRes = await davRequest(principalUrl, "PROPFIND", creds, HOMESET_PROPFIND, "0");
  const homeXml = xmlParser.parse(homeRes.text);
  const homeHref = textOf(
    findAll(homeXml, "calendar-home-set").flatMap((p) => findAll(p, "href"))[0]
  );
  if (!homeHref) {
    throw new Error("Couldn't find your calendar home collection.");
  }
  const homeUrl = resolveUrl(creds.url, homeHref);

  const listRes = await davRequest(homeUrl, "PROPFIND", creds, CALENDARS_PROPFIND, "1");
  const listXml = xmlParser.parse(listRes.text);
  const responses = findAll(listXml, "response");

  const calendars: DiscoveredCalendar[] = [];
  for (const r of responses) {
    const resourcetypes = findAll(r, "resourcetype");
    const isCalendar = resourcetypes.some(
      (rt) => rt && typeof rt === "object" && "calendar" in (rt as Record<string, unknown>)
    );
    if (!isCalendar) continue;
    const href = textOf(findAll(r, "href")[0]);
    if (!href) continue;
    const name = textOf(findAll(r, "displayname")[0]) || href;
    calendars.push({ url: resolveUrl(homeUrl, href), name });
  }
  return calendars;
}

function parseVEventFromIcs(ics: string): { item: VEvent; startDate: Date; endDate: Date } | null {
  let parsed: CalendarResponse;
  try {
    parsed = ical.sync.parseICS(ics);
  } catch {
    return null;
  }
  for (const item of Object.values(parsed)) {
    if (!item || item.type !== "VEVENT") continue;
    const startDate = item.start ? new Date(item.start) : null;
    if (!startDate) continue;
    const endDate = item.end ? new Date(item.end) : startDate;
    return { item, startDate, endDate };
  }
  return null;
}

async function fetchEventsFromCalendar(
  calendarUrl: string,
  calendarName: string,
  creds: CaldavCreds,
  start: Date,
  end: Date
): Promise<CalendarEvent[]> {
  const res = await davRequest(
    calendarUrl,
    "REPORT",
    creds,
    calendarQueryReport(start, end),
    "1"
  );
  if (res.status >= 400) return [];
  const xml = xmlParser.parse(res.text);
  const responses = findAll(xml, "response");

  const events: CalendarEvent[] = [];
  for (const r of responses) {
    const href = textOf(findAll(r, "href")[0]);
    const etag = textOf(findAll(r, "getetag")[0]);
    const ics = textOf(findAll(r, "calendar-data")[0]);
    if (!href || !ics) continue;

    const parsed = parseVEventFromIcs(ics);
    if (!parsed) continue;
    const { item, startDate, endDate } = parsed;

    events.push({
      uid: item.uid ?? href,
      href: resolveUrl(calendarUrl, href),
      etag: etag ?? undefined,
      calendarName,
      summary: unwrapValue(item.summary) || "(untitled event)",
      start: startDate.toISOString(),
      end: endDate.toISOString(),
      allDay: item.datetype === "date",
      location: unwrapValue(item.location),
      description: unwrapValue(item.description),
    });
  }
  return events;
}

export async function fetchCalendarEvents(
  creds: CaldavCreds,
  start: Date,
  end: Date
): Promise<CalendarEvent[]> {
  const calendars = await discoverCalendars(creds);
  if (calendars.length === 0) {
    throw new Error("No calendars found for this account.");
  }
  const results = await Promise.all(
    calendars.map((c) => fetchEventsFromCalendar(c.url, c.name, creds, start, end))
  );
  const events = results.flat();
  events.sort((a, b) => a.start.localeCompare(b.start));
  return events;
}

// ---- editing ----

function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function formatIcsDate(date: Date, allDay: boolean): string {
  if (allDay) {
    return date.toISOString().slice(0, 10).replace(/-/g, "");
  }
  return date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

export type EventEdits = {
  summary?: string;
  location?: string;
  start?: Date;
  end?: Date;
  allDay: boolean;
};

/**
 * Applies a small set of edits to a raw VEVENT's iCalendar text via surgical
 * line replacement, leaving every other property (RRULE, VALARM, ATTENDEE,
 * etc.) untouched — safer than regenerating the event from scratch.
 */
export function applyEventEdits(rawIcs: string, edits: EventEdits): string {
  const lines = rawIcs.split(/\r\n|\n/);
  let inVevent = false;

  const replaced = lines.map((line) => {
    if (/^BEGIN:VEVENT/.test(line)) inVevent = true;
    if (/^END:VEVENT/.test(line)) inVevent = false;
    if (!inVevent) return line;

    if (edits.summary !== undefined && /^SUMMARY[:;]/.test(line)) {
      return `SUMMARY:${escapeIcsText(edits.summary)}`;
    }
    if (edits.location !== undefined && /^LOCATION[:;]/.test(line)) {
      return `LOCATION:${escapeIcsText(edits.location)}`;
    }
    if (edits.start && /^DTSTART[:;]/.test(line)) {
      return edits.allDay
        ? `DTSTART;VALUE=DATE:${formatIcsDate(edits.start, true)}`
        : `DTSTART:${formatIcsDate(edits.start, false)}`;
    }
    if (edits.end && /^DTEND[:;]/.test(line)) {
      return edits.allDay
        ? `DTEND;VALUE=DATE:${formatIcsDate(edits.end, true)}`
        : `DTEND:${formatIcsDate(edits.end, false)}`;
    }
    return line;
  });

  // if the original event had no LOCATION line at all but one was requested, add it
  if (edits.location !== undefined && !replaced.some((l) => /^LOCATION[:;]/.test(l))) {
    const endIdx = replaced.findIndex((l) => /^END:VEVENT/.test(l));
    if (endIdx !== -1) {
      replaced.splice(endIdx, 0, `LOCATION:${escapeIcsText(edits.location)}`);
    }
  }

  return replaced.join("\r\n");
}

export async function fetchEventRaw(
  href: string,
  creds: CaldavCreds
): Promise<{ raw: string; etag: string | null }> {
  const res = await davRequest(href, "GET", creds, undefined, undefined);
  if (res.status >= 400) {
    throw new Error(`Couldn't load that event (server returned ${res.status}).`);
  }
  return { raw: res.text, etag: res.etag };
}

export async function saveEvent(
  href: string,
  creds: CaldavCreds,
  etag: string | undefined,
  rawIcs: string
): Promise<void> {
  const res = await davRequest(href, "PUT", creds, rawIcs, undefined, {
    "Content-Type": "text/calendar; charset=utf-8",
    ...(etag ? { "If-Match": etag } : {}),
  });
  if (res.status === 412) {
    throw new Error("This event changed on the server since you loaded it — refresh and try again.");
  }
  if (res.status >= 400) {
    throw new Error(`Couldn't save the event (server returned ${res.status}).`);
  }
}

export type NewEventFields = {
  summary: string;
  location?: string;
  start: Date;
  end: Date;
  allDay: boolean;
};

export async function createEvent(
  calendarUrl: string,
  creds: CaldavCreds,
  fields: NewEventFields
): Promise<string> {
  const uid = `${randomUUID()}@dm-notes`;
  const stamp = formatIcsDate(new Date(), false);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//DM Notes//EN",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
    fields.allDay
      ? `DTSTART;VALUE=DATE:${formatIcsDate(fields.start, true)}`
      : `DTSTART:${formatIcsDate(fields.start, false)}`,
    fields.allDay
      ? `DTEND;VALUE=DATE:${formatIcsDate(fields.end, true)}`
      : `DTEND:${formatIcsDate(fields.end, false)}`,
    `SUMMARY:${escapeIcsText(fields.summary)}`,
  ];
  if (fields.location) lines.push(`LOCATION:${escapeIcsText(fields.location)}`);
  lines.push("END:VEVENT", "END:VCALENDAR");
  const ics = lines.join("\r\n");

  const base = calendarUrl.endsWith("/") ? calendarUrl : `${calendarUrl}/`;
  const href = `${base}${uid}.ics`;

  const res = await davRequest(href, "PUT", creds, ics, undefined, {
    "Content-Type": "text/calendar; charset=utf-8",
    "If-None-Match": "*",
  });
  if (res.status >= 400) {
    throw new Error(`Couldn't create the event (server returned ${res.status}).`);
  }
  return href;
}
