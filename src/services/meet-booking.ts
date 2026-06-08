import type { FastifyBaseLogger } from 'fastify';
import { config } from '../config.js';
import {
  addAttendee,
  cancelEvent,
  createMeet,
  findNextFreeSlot,
  isFree,
} from './google-calendar.js';
import { parseMeetTime } from './meet-time-parser.js';
import {
  setCustomerEmail,
  setMeetEvent,
  setMeetStatus,
  type ConversationRow,
  type LeadData,
} from './leads.js';
import { detectCountry } from './country-detect.js';

/**
 * Pick the timezone the customer is most likely thinking in when they
 * type "tomorrow 4 PM". Falls back to the owner's working timezone if
 * we can't tell from the phone — better than nothing.
 */
function customerTimezone(conv: ConversationRow): string {
  const info = detectCountry(conv.phone);
  // Unknown country → use the owner's working TZ as fallback
  if (info.code === 'XX') return config.google.workingTimezone;
  return info.timezone;
}

/**
 * Phase 8 — deterministic booking sub-flow for international Meets.
 *
 * Driven by `conv.meet_status`. The LLM is freed from juggling
 * calendar logic: after the LLM finishes capturing the name (end of
 * Phase 7 step 6), the webhook hands control to this state machine
 * for any subsequent inbound message until `finished=true` is
 * returned.
 *
 * The machine is OWNED by the webhook; this module is pure logic +
 * DB writes. Replies returned here are what the bot should say next.
 */

export type AdvanceResult =
  | {
      kind: 'reply';
      text: string;
    }
  | {
      kind: 'finished';
      text: string;
      // Patch to merge into the LeadData before saveQualifiedLead runs.
      // The conversations table has already been updated with the
      // booking details; this just makes sure the LeadData snapshot
      // is consistent.
      patch: Partial<LeadData> & {
        meet_event_id?: string | null;
        meet_link?: string | null;
        customer_email?: string | null;
      };
    }
  | {
      kind: 'fallback_manual';
      text: string;
    };

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

function meetSummary(name: string | null, countryCode: string | null): string {
  const n = name?.trim() || 'Botifys lead';
  const c = countryCode && countryCode !== 'XX' ? ` (${countryCode})` : '';
  return `Botifys discovery call — ${n}${c}`;
}

function formatHumanTime(iso: string, tz: string): string {
  try {
    return new Date(iso).toLocaleString('en-IN', {
      timeZone: tz,
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return new Date(iso).toUTCString();
  }
}

/**
 * Kick off the booking sub-flow. Called by the webhook on the turn
 * where the LLM emits QUALIFY_AND_SAVE for an international lead.
 * Sets meet_status='awaiting_time' and returns the bot's question.
 */
export function startBooking(conv: ConversationRow): AdvanceResult {
  setMeetStatus(conv.phone, 'awaiting_time');
  const name = conv.whatsapp_name?.trim();
  const greeting = name ? `Thanks ${name}! ` : 'Thanks! ';
  return {
    kind: 'reply',
    text:
      greeting +
      `Last step: what day & time works best for a quick ${config.google.meetDurationMinutes}-min Google Meet with our team? (A date + time in your local timezone is perfect.)`,
  };
}

/**
 * Advance the state machine by one customer message. The LLM is
 * completely bypassed for these turns — replies are returned here
 * and sent verbatim.
 */
export async function advanceBooking(
  conv: ConversationRow,
  customerText: string,
  customerName: string | null,
  log: FastifyBaseLogger
): Promise<AdvanceResult> {
  switch (conv.meet_status) {
    case 'awaiting_time':
      return await handleAwaitingTime(conv, customerText, customerName, log);
    case 'awaiting_alt_confirm':
      return await handleAwaitingAltConfirm(conv, customerText, customerName, log);
    case 'awaiting_email':
      return await handleAwaitingEmail(conv, customerText, log);
    default:
      // Any other status (confirmed, failed, etc.) shouldn't have hit
      // this code path — fall back to manual to be safe.
      return { kind: 'fallback_manual', text: '' };
  }
}

async function handleAwaitingTime(
  conv: ConversationRow,
  customerText: string,
  customerName: string | null,
  log: FastifyBaseLogger
): Promise<AdvanceResult> {
  // Parse in the CUSTOMER's timezone — when a UAE customer says
  // "tomorrow 4 PM" they mean 4 PM Dubai time, not 4 PM IST. The
  // bot/owner-facing IST formatting happens separately in the
  // salesperson notification.
  const customerTz = customerTimezone(conv);
  const parsed = await parseMeetTime(customerText, customerTz);

  if (!parsed.ok) {
    if (parsed.reason === 'in_past') {
      return {
        kind: 'reply',
        text: 'That time is in the past — could you share a future day and time?',
      };
    }
    if (parsed.reason === 'ambiguous_no_date') {
      return {
        kind: 'reply',
        text: 'Got the time but not the day. Could you share both? (e.g. "Tuesday 4 PM")',
      };
    }
    return {
      kind: 'reply',
      text:
        'I couldn\'t quite figure out a time from that. Could you try a specific day and time? (e.g. "Wed 10 AM", "tomorrow 3 PM")',
    };
  }

  const durMin = config.google.meetDurationMinutes;
  const startISO = parsed.iso_datetime;
  const endISO = new Date(new Date(startISO).getTime() + durMin * 60 * 1000).toISOString();

  let free: boolean;
  try {
    free = await isFree(startISO, endISO);
  } catch (err) {
    log.error({ err, phone: conv.phone }, 'isFree failed; falling back to manual');
    setMeetStatus(conv.phone, 'fallback_manual');
    return { kind: 'fallback_manual', text: parsed.human };
  }

  if (free) {
    // Create the event WITHOUT attendee yet — we still need the email.
    // Event's primary TZ is the OWNER's working TZ (IST) so it sits
    // naturally on the owner's calendar; Google renders it correctly
    // for the customer wherever they view it.
    try {
      const ev = await createMeet({
        summary: meetSummary(customerName, conv.country_code),
        description: `Booked via Botifys WhatsApp bot.\nCustomer phone: +${conv.phone}`,
        startISO,
        endISO,
        timezone: config.google.workingTimezone,
      });
      setMeetEvent(conv.phone, {
        eventId: ev.eventId,
        link: ev.hangoutLink,
        iso: startISO,
        status: 'awaiting_email',
      });
      log.info({ phone: conv.phone, eventId: ev.eventId, startISO, customerTz }, 'Meet booked, awaiting email');
      // Echo in the customer's local TZ so they recognise their own time.
      const human = formatHumanTime(startISO, customerTz);
      return {
        kind: 'reply',
        text: `Perfect! Booked ${human} on our side. What's the best email to send you the Meet invite?`,
      };
    } catch (err) {
      log.error({ err, phone: conv.phone }, 'createMeet failed; falling back to manual');
      setMeetStatus(conv.phone, 'fallback_manual');
      return { kind: 'fallback_manual', text: parsed.human };
    }
  }

  // Busy — find the next free slot.
  let alt: string | null = null;
  try {
    alt = await findNextFreeSlot(startISO, durMin);
  } catch (err) {
    log.warn({ err, phone: conv.phone }, 'findNextFreeSlot failed; falling back to manual');
    setMeetStatus(conv.phone, 'fallback_manual');
    return { kind: 'fallback_manual', text: parsed.human };
  }

  if (!alt) {
    // No alternative within horizon — manual fallback.
    setMeetStatus(conv.phone, 'fallback_manual');
    return { kind: 'fallback_manual', text: parsed.human };
  }

  setMeetEvent(conv.phone, {
    eventId: null,
    link: null,
    iso: alt,
    status: 'awaiting_alt_confirm',
  });
  // Customer-facing — show alternative in THEIR local TZ.
  const altHuman = formatHumanTime(alt, customerTz);
  const requested = parsed.human;
  return {
    kind: 'reply',
    text: `${requested} is taken on our side. The next free slot is ${altHuman}. Does that work, or another time?`,
  };
}

async function handleAwaitingAltConfirm(
  conv: ConversationRow,
  customerText: string,
  customerName: string | null,
  log: FastifyBaseLogger
): Promise<AdvanceResult> {
  const tz = config.google.workingTimezone;
  const lower = customerText.trim().toLowerCase();
  const affirmative =
    /\b(yes|yeah|yep|sure|ok|okay|works|good|fine|perfect|confirmed?)\b/.test(lower);
  const declines = /\b(no|nope|not|another|different|else)\b/.test(lower);

  // If they agreed AND we have a proposed iso, book it.
  if (affirmative && !declines && conv.meet_proposed_iso) {
    const startISO = conv.meet_proposed_iso;
    const endISO = new Date(
      new Date(startISO).getTime() + config.google.meetDurationMinutes * 60 * 1000
    ).toISOString();
    try {
      const ev = await createMeet({
        summary: meetSummary(customerName, conv.country_code),
        description: `Booked via Botifys WhatsApp bot.\nCustomer phone: +${conv.phone}`,
        startISO,
        endISO,
        timezone: tz,
      });
      setMeetEvent(conv.phone, {
        eventId: ev.eventId,
        link: ev.hangoutLink,
        iso: startISO,
        status: 'awaiting_email',
      });
      log.info({ phone: conv.phone, eventId: ev.eventId }, 'Meet booked on alternative slot');
      const human = formatHumanTime(startISO, tz);
      return {
        kind: 'reply',
        text: `Great! Booked ${human}. What's the best email to send you the Meet invite?`,
      };
    } catch (err) {
      log.error({ err, phone: conv.phone }, 'createMeet (alt) failed; falling back');
      setMeetStatus(conv.phone, 'fallback_manual');
      return { kind: 'fallback_manual', text: formatHumanTime(startISO, tz) };
    }
  }

  // Otherwise treat their message as a NEW preferred time — loop back
  // to awaiting_time logic.
  setMeetStatus(conv.phone, 'awaiting_time');
  return await handleAwaitingTime(
    { ...conv, meet_status: 'awaiting_time' },
    customerText,
    customerName,
    log
  );
}

async function handleAwaitingEmail(
  conv: ConversationRow,
  customerText: string,
  log: FastifyBaseLogger
): Promise<AdvanceResult> {
  const match = customerText.match(EMAIL_RE);
  if (match) {
    const email = match[0].toLowerCase();
    if (!conv.meet_event_id) {
      // Shouldn't happen, but if we somehow reached this state with
      // no event, fall back.
      setMeetStatus(conv.phone, 'fallback_manual');
      return { kind: 'fallback_manual', text: '' };
    }
    try {
      await addAttendee(conv.meet_event_id, email);
      setCustomerEmail(conv.phone, email);
      setMeetStatus(conv.phone, 'confirmed');
      log.info({ phone: conv.phone, email, eventId: conv.meet_event_id }, 'Meet attendee added, invite sent');
      const human = conv.meet_proposed_iso
        ? formatHumanTime(conv.meet_proposed_iso, config.google.workingTimezone)
        : 'your booked time';
      return {
        kind: 'finished',
        text: `Done! Booked for ${human}. Check ${email} for the calendar invite. Talk soon!`,
        patch: {
          meet_event_id: conv.meet_event_id,
          meet_link: conv.meet_link,
          customer_email: email,
        },
      };
    } catch (err) {
      log.error({ err, phone: conv.phone }, 'addAttendee failed; falling back to manual');
      setMeetStatus(conv.phone, 'fallback_manual');
      return {
        kind: 'finished',
        text:
          'Booked! I had trouble emailing the calendar invite, but here is the Meet link: ' +
          (conv.meet_link ?? '') +
          '. Talk soon!',
        patch: {
          meet_event_id: conv.meet_event_id,
          meet_link: conv.meet_link,
          customer_email: email,
        },
      };
    }
  }

  // Refusal / skip / garbage email — accept without email, send link directly.
  const lower = customerText.trim().toLowerCase();
  const refusing = /\b(skip|no|nope|later|nah|none|n\/a)\b/.test(lower);
  if (refusing && conv.meet_link) {
    setMeetStatus(conv.phone, 'confirmed');
    const human = conv.meet_proposed_iso
      ? formatHumanTime(conv.meet_proposed_iso, config.google.workingTimezone)
      : 'your booked time';
    return {
      kind: 'finished',
      text:
        `No worries. Here's your Meet link for ${human}: ${conv.meet_link}. Talk soon!`,
      patch: {
        meet_event_id: conv.meet_event_id,
        meet_link: conv.meet_link,
        customer_email: null,
      },
    };
  }

  // Ask once more.
  return {
    kind: 'reply',
    text:
      'I didn\'t catch a valid email. Could you share the one you\'d like the Meet invite at? (Or say "skip" and I\'ll send you the link here.)',
  };
}

// Re-exported for the webhook to cancel a half-booked Meet if it
// hits a fatal error during the flow.
export { cancelEvent };
