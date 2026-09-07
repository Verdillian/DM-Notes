import { XMLParser } from "fast-xml-parser";
import ical, { type CalendarResponse } from "node-ical";

export type CalendarEvent = {
  uid: string;
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
  body: string,
  depth: string
): Promise<{ status: number; text: string }> {
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: authHeader(creds.username, creds.password),
      "Content-Type": "application/xml; charset=utf-8",
      Depth: depth,
    },
    body,
  });
  const text = await res.text();
  return { status: res.status, text };
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

async function fetchEventsFromCalendar(
  calendarUrl: string,
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
  const blocks = findAll(xml, "calendar-data")
    .map(textOf)
    .filter((s): s is string => !!s);

  const events: CalendarEvent[] = [];
  for (const ics of blocks) {
    let parsed: CalendarResponse;
    try {
      parsed = ical.sync.parseICS(ics);
    } catch {
      continue;
    }
    for (const item of Object.values(parsed)) {
      if (!item || item.type !== "VEVENT") continue;
      const startDate = item.start ? new Date(item.start) : null;
      if (!startDate) continue;
      const endDate = item.end ? new Date(item.end) : startDate;
      events.push({
        uid: item.uid ?? `${calendarUrl}-${startDate.toISOString()}`,
        summary: unwrapValue(item.summary) || "(untitled event)",
        start: startDate.toISOString(),
        end: endDate.toISOString(),
        allDay: item.datetype === "date",
        location: unwrapValue(item.location),
        description: unwrapValue(item.description),
      });
    }
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
    calendars.map((c) => fetchEventsFromCalendar(c.url, creds, start, end))
  );
  const events = results.flat();
  events.sort((a, b) => a.start.localeCompare(b.start));
  return events;
}
