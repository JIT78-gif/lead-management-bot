import type { FastifyBaseLogger } from 'fastify';
import { config } from '../config.js';
import { sendText } from './meta.js';
import { getConversation, type LeadData } from './leads.js';
import { detectCountry } from './country-detect.js';
import { nicheLabel, type Niche } from './niche-detect.js';

/**
 * Notify each configured salesperson on WhatsApp that a new lead qualified.
 * Fire-and-forget: failures (e.g. Meta's 24-hour customer-service window
 * being closed for that salesperson) are logged as warnings, not errors,
 * so the lead-qualification flow keeps running cleanly.
 */
export async function notifySalesteam(
  leadPhone: string,
  data: LeadData,
  log: FastifyBaseLogger
): Promise<void> {
  const recipients = config.notify.salespersonPhones;
  if (recipients.length === 0) {
    log.info('salesperson notifications disabled (no SALESPERSON_PHONES set)');
    return;
  }

  const text = formatNotification(leadPhone, data);
  log.info(
    { recipientCount: recipients.length, leadPhone },
    'notifying salespeople of new lead'
  );

  await Promise.all(
    recipients.map(async (sp) => {
      try {
        await sendText(sp, text);
        log.info({ salesperson: sp, leadPhone }, 'salesperson notified');
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log.warn(
          { salesperson: sp, leadPhone, err: msg },
          'salesperson notification failed (likely 24-hour window closed; ' +
            'salesperson must message the bot to reopen, or set up a Meta template)'
        );
      }
    })
  );
}

function formatNotification(leadPhone: string, data: LeadData): string {
  // Phase 7 — country / niche aware notification. Pull the niche from
  // the conversation row (server-detected on the first inbound).
  const country = detectCountry(leadPhone);
  const conv = getConversation(leadPhone);
  const niche = (conv?.niche as Niche | null | undefined) ?? null;

  const headline = country.isIndia
    ? `🔥 New qualified lead — ${country.flag} ${country.name}`
    : `🌐 New international lead — ${country.flag} ${country.name}`;

  const lines: string[] = [headline];
  if (niche && niche !== 'other') lines.push(`Niche: ${nicheLabel(niche)}`);
  if (data.name) lines.push(`Name: ${data.name}`);
  if (data.industry) lines.push(`Business: ${data.industry}`);
  if (data.niche_detail) lines.push(`Niche detail: ${data.niche_detail}`);
  if (data.team_size) lines.push(`Team: ${data.team_size}`);
  if (data.website_url) lines.push(`Website: ${data.website_url}`);
  if (data.social_handle) lines.push(`Social: ${data.social_handle}`);
  lines.push(`Phone: +${leadPhone}`);

  // Phase 8 — if the server-side booking flow created a real Meet, the
  // conversation row carries the link + email. Prefer those over the
  // Phase-7-era meet_preferred_time text.
  const meetLink = conv?.meet_link ?? null;
  const meetProposedIso = conv?.meet_proposed_iso ?? null;
  const customerEmail = conv?.customer_email ?? null;

  if (!country.isIndia) {
    lines.push('');
    if (meetLink && meetProposedIso) {
      const when = new Date(meetProposedIso).toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
      lines.push(`📅 Booked: ${when} IST`);
      lines.push(`🔗 Meet link: ${meetLink}`);
      if (customerEmail) lines.push(`📧 Invite sent to: ${customerEmail}`);
    } else if (data.meet_preferred_time) {
      lines.push(`📅 Google Meet preferred: ${data.meet_preferred_time}`);
    }
  }

  lines.push('');
  lines.push(`Open: ${config.notify.dashboardUrl}/dashboard/lead/${leadPhone}`);
  lines.push('');
  lines.push(
    country.isIndia
      ? `Action: call within 1 hour.`
      : meetLink
        ? `Action: join the Meet at the booked time.`
        : `Action: send a Google Meet invite${data.meet_preferred_time ? ' for ' + data.meet_preferred_time : ''}.`
  );
  return lines.join('\n');
}

/**
 * Notify salespeople the moment a brand-new conversation starts — fires
 * once, when the very first inbound message creates the conversation row.
 * Gives the team early awareness so they can watch the qualifying flow
 * live (and intervene with manual takeover if the bot misclassifies).
 *
 * Fire-and-forget. Failures are logged warn, never thrown.
 */
export async function notifyNewChat(
  leadPhone: string,
  whatsappName: string | null,
  firstMessage: string,
  log: FastifyBaseLogger
): Promise<void> {
  const recipients = config.notify.salespersonPhones;
  if (recipients.length === 0) return;

  const who = whatsappName?.trim() || `+${leadPhone}`;
  const snippet =
    firstMessage.length > 140
      ? firstMessage.slice(0, 140).trim() + '…'
      : firstMessage;

  const text = [
    '🆕 New chat started',
    `From: ${who}`,
    `Phone: +${leadPhone}`,
    '',
    `Their first message:`,
    `"${snippet}"`,
    '',
    `Open: ${config.notify.dashboardUrl}/dashboard/chats/${leadPhone}`,
  ].join('\n');

  log.info(
    { recipientCount: recipients.length, leadPhone },
    'notifying salespeople of new chat'
  );

  await Promise.all(
    recipients.map(async (sp) => {
      try {
        await sendText(sp, text);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log.warn(
          { salesperson: sp, leadPhone, err: msg },
          'new-chat notification failed (likely 24h window closed)'
        );
      }
    })
  );
}
