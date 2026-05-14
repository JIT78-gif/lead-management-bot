import type { FastifyBaseLogger } from 'fastify';
import { config } from '../config.js';
import { sendText } from './meta.js';
import type { LeadData } from './leads.js';

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
  const lines: string[] = ['🔥 New qualified lead'];
  if (data.name) lines.push(`Name: ${data.name}`);
  if (data.industry) lines.push(`Business: ${data.industry}`);
  if (data.team_size) lines.push(`Team: ${data.team_size}`);
  if (data.website_url) lines.push(`Website: ${data.website_url}`);
  if (data.social_handle) lines.push(`Social: ${data.social_handle}`);
  lines.push(`Phone: +${leadPhone}`);
  lines.push('');
  lines.push(`Open: ${config.notify.dashboardUrl}/dashboard/lead/${leadPhone}`);
  return lines.join('\n');
}
