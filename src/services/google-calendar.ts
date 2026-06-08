import { google } from 'googleapis';
import { config } from '../config.js';
import { getAuthClient } from './google-oauth.js';

/**
 * Thin Google Calendar API wrapper used by the international Meet
 * booking flow. All times are ISO 8601 UTC strings on the boundary;
 * Calendar handles internal storage/conversion.
 *
 * Working hours are interpreted in `config.google.workingTimezone`
 * (default Asia/Kolkata). The `findNextFreeSlot()` search only
 * proposes times INSIDE that window — but customers can still
 * request any time and we'll book it if free.
 */

export interface MeetEvent {
  eventId: string;
  hangoutLink: string;
  htmlLink: string;
}

const DAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
type DayName = (typeof DAY_NAMES)[number];

function calendar() {
  // We get the auth client per-call so token refresh stays transparent.
  // Callers should debounce if they hit this in a tight loop.
  return google.calendar({ version: 'v3' });
}

/**
 * Returns true when the owner's calendar is FREE in [startISO, endISO).
 * Returns false if there's any overlapping busy block.
 */
export async function isFree(startISO: string, endISO: string): Promise<boolean> {
  const auth = (await getAuthClient()) as unknown as never;
  const res = await calendar().freebusy.query({
    auth,
    requestBody: {
      timeMin: startISO,
      timeMax: endISO,
      items: [{ id: config.google.calendarId }],
    },
  });
  const busy = res.data.calendars?.[config.google.calendarId]?.busy ?? [];
  return busy.length === 0;
}

/**
 * Search forward from `afterISO` for the next free slot of
 * `durationMin` minutes within working hours (config.google.*). Steps
 * in 30-min increments to keep candidate suggestions clean. Returns
 * the start ISO of the first free slot, or null if nothing found
 * within `searchHorizonDays`.
 */
export async function findNextFreeSlot(
  afterISO: string,
  durationMin: number = config.google.meetDurationMinutes,
  searchHorizonDays: number = 14
): Promise<string | null> {
  const auth = (await getAuthClient()) as unknown as never;
  const tz = config.google.workingTimezone;
  const workingDays = new Set<DayName>(config.google.workingDays as DayName[]);
  const [startH, startM] = parseHHMM(config.google.workingHoursStart);
  const [endH, endM] = parseHHMM(config.google.workingHoursEnd);

  const horizonStart = new Date(afterISO);
  const horizonEnd = new Date(horizonStart.getTime() + searchHorizonDays * 24 * 60 * 60 * 1000);

  // Single freebusy query for the whole horizon — cheaper than slot-by-slot.
  const fb = await calendar().freebusy.query({
    auth,
    requestBody: {
      timeMin: horizonStart.toISOString(),
      timeMax: horizonEnd.toISOString(),
      items: [{ id: config.google.calendarId }],
      timeZone: tz,
    },
  });
  const busyBlocks = (fb.data.calendars?.[config.google.calendarId]?.busy ?? []).map(
    (b) => ({ start: new Date(b.start!).getTime(), end: new Date(b.end!).getTime() })
  );

  const stepMs = 30 * 60 * 1000;
  const durationMs = durationMin * 60 * 1000;

  // Round candidate up to the next 30-min boundary in the working TZ.
  let cursor = new Date(Math.ceil(horizonStart.getTime() / stepMs) * stepMs);

  while (cursor.getTime() + durationMs <= horizonEnd.getTime()) {
    if (slotWithinWorkingWindow(cursor, durationMin, tz, workingDays, startH, startM, endH, endM)) {
      const cs = cursor.getTime();
      const ce = cs + durationMs;
      const overlap = busyBlocks.some((b) => !(b.end <= cs || b.start >= ce));
      if (!overlap) return cursor.toISOString();
    }
    cursor = new Date(cursor.getTime() + stepMs);
  }
  return null;
}

/**
 * Create a calendar event with an attached Google Meet. Customer
 * email is optional — if provided, they're added as an attendee and
 * Google sends them the calendar invite automatically.
 *
 * Title is constructed for the salesperson — keep it short, the bot
 * + dashboard show context separately.
 */
export async function createMeet(args: {
  summary: string;
  description?: string;
  startISO: string;
  endISO: string;
  customerEmail?: string | null;
  timezone?: string;
}): Promise<MeetEvent> {
  const auth = (await getAuthClient()) as unknown as never;
  const tz = args.timezone ?? config.google.workingTimezone;

  const attendees = args.customerEmail
    ? [{ email: args.customerEmail }]
    : undefined;

  // Random conferenceData.requestId so Google generates a Meet link.
  // Must be unique per insert.
  const requestId = `botifys-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  const res = await calendar().events.insert({
    auth,
    calendarId: config.google.calendarId,
    conferenceDataVersion: 1,
    sendUpdates: attendees ? 'all' : 'none',
    requestBody: {
      summary: args.summary,
      description: args.description,
      start: { dateTime: args.startISO, timeZone: tz },
      end: { dateTime: args.endISO, timeZone: tz },
      attendees,
      conferenceData: {
        createRequest: { requestId, conferenceSolutionKey: { type: 'hangoutsMeet' } },
      },
    },
  });

  const eventId = res.data.id;
  const hangoutLink = res.data.hangoutLink ?? res.data.conferenceData?.entryPoints?.[0]?.uri ?? '';
  const htmlLink = res.data.htmlLink ?? '';
  if (!eventId || !hangoutLink) {
    throw new Error('Calendar created the event but no Meet link came back');
  }

  return { eventId, hangoutLink, htmlLink };
}

/**
 * Patch an existing event to add a customer email as attendee. Google
 * sends them the calendar invite automatically.
 */
export async function addAttendee(eventId: string, email: string): Promise<void> {
  const auth = (await getAuthClient()) as unknown as never;
  // Fetch existing attendees so we don't blow them away on patch.
  const existing = await calendar().events.get({
    auth,
    calendarId: config.google.calendarId,
    eventId,
  });
  const attendees = existing.data.attendees ?? [];
  if (!attendees.some((a) => a.email?.toLowerCase() === email.toLowerCase())) {
    attendees.push({ email });
  }

  await calendar().events.patch({
    auth,
    calendarId: config.google.calendarId,
    eventId,
    sendUpdates: 'all',
    requestBody: { attendees },
  });
}

/** Best-effort cancellation, used when the bot fails mid-flow. */
export async function cancelEvent(eventId: string): Promise<void> {
  const auth = (await getAuthClient()) as unknown as never;
  await calendar().events.delete({
    auth,
    calendarId: config.google.calendarId,
    eventId,
    sendUpdates: 'all',
  });
}

// ─── helpers ──────────────────────────────────────────────────────

function parseHHMM(s: string): [number, number] {
  const parts = s.split(':').map((x) => parseInt(x, 10));
  const h = parts[0];
  const m = parts[1];
  return [Number.isFinite(h) ? h! : 9, Number.isFinite(m) ? m! : 0];
}

/**
 * Returns true when the slot [start, start+duration) lies entirely
 * inside the working window on a working day, evaluated in `tz`.
 *
 * Uses Intl.DateTimeFormat to figure out the local hour/minute/day
 * without bringing in a TZ library. The cost is one Intl call per
 * slot evaluated — fine for a 14-day, 30-min-grid search.
 */
function slotWithinWorkingWindow(
  start: Date,
  durationMin: number,
  tz: string,
  workingDays: Set<DayName>,
  startH: number,
  startM: number,
  endH: number,
  endM: number
): boolean {
  const localStart = getLocalParts(start, tz);
  const localEnd = getLocalParts(new Date(start.getTime() + durationMin * 60 * 1000), tz);

  if (!workingDays.has(localStart.day) || !workingDays.has(localEnd.day)) return false;
  if (localStart.day !== localEnd.day) return false; // don't straddle midnight

  const localStartMin = localStart.hour * 60 + localStart.minute;
  const localEndMin = localEnd.hour * 60 + localEnd.minute;
  const windowStart = startH * 60 + startM;
  const windowEnd = endH * 60 + endM;

  return localStartMin >= windowStart && localEndMin <= windowEnd;
}

function getLocalParts(d: Date, tz: string): { day: DayName; hour: number; minute: number } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short',
    hour: 'numeric',
    hour12: false,
    minute: '2-digit',
  });
  const parts = fmt.formatToParts(d);
  const weekday = parts.find((p) => p.type === 'weekday')?.value?.toLowerCase() ?? '';
  const hour = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10);
  const minute = parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0', 10);
  const day = (DAY_NAMES.find((d) => weekday.startsWith(d)) ?? 'mon') as DayName;
  // Intl uses "24" for midnight in some locales — normalise.
  const normalisedHour = hour === 24 ? 0 : hour;
  return { day, hour: normalisedHour, minute };
}
