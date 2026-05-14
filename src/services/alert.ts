import type { FastifyBaseLogger } from 'fastify';
import { config } from '../config.js';

const COOLDOWN_MS = 5 * 60_000; // max 1 alert per category per 5 minutes
const lastSent = new Map<string, number>();

export interface AlertContext {
  /** A short stable category used to throttle similar alerts. */
  category: string;
  /** Email subject — keep it short, ~50 chars max. */
  subject: string;
  /** Plain-text body. Newlines are preserved. */
  body: string;
}

/**
 * Send an error alert email via Resend. Fire-and-forget — failures here
 * are logged at "warn" level so they never crash the actual customer flow.
 *
 * Throttled per category: if the same category fired in the last 5
 * minutes, this call is silently dropped to avoid flooding the inbox
 * during recurring errors.
 */
export function sendAlert(ctx: AlertContext, log: FastifyBaseLogger): void {
  const apiKey = config.alerts.resendApiKey;
  const to = config.alerts.toEmail;
  const from = config.alerts.fromEmail;

  if (!apiKey || !to) {
    // Alerts are disabled — caller's flow continues normally.
    return;
  }

  const now = Date.now();
  const last = lastSent.get(ctx.category) ?? 0;
  if (now - last < COOLDOWN_MS) {
    log.info(
      { category: ctx.category, secondsAgo: Math.floor((now - last) / 1000) },
      'alert throttled (already sent recently)'
    );
    return;
  }
  lastSent.set(ctx.category, now);

  // Fire-and-forget so the caller's flow doesn't wait for SMTP/network.
  void deliver(apiKey, from, to, ctx, log);
}

async function deliver(
  apiKey: string,
  from: string,
  to: string,
  ctx: AlertContext,
  log: FastifyBaseLogger
): Promise<void> {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: ctx.subject,
        text: ctx.body,
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      log.warn(
        { status: res.status, body: errBody, category: ctx.category },
        'error alert failed to send'
      );
      return;
    }

    log.info({ category: ctx.category, to }, 'error alert sent');
  } catch (err) {
    log.warn({ err, category: ctx.category }, 'error alert dispatch failed');
  }
}

/**
 * Helper: format a typical "bot couldn't reply to a customer" alert.
 */
export function leadFailureAlert(args: {
  reason: 'gemini_failed' | 'send_failed' | 'analysis_failed';
  customerPhone: string;
  customerName: string | null;
  customerLastMessage: string;
  conversationState: string;
  errorMessage: string;
}): AlertContext {
  const reasonLabel: Record<typeof args.reason, string> = {
    gemini_failed:
      'Gemini failed twice — bot sent the "having a small issue" fallback to the customer',
    send_failed: 'Meta API rejected the bot reply — customer received nothing',
    analysis_failed: 'Call analysis failed — recording stored without AI summary',
  };

  const dashLink = `${config.notify.dashboardUrl}/dashboard/lead/${args.customerPhone}`;
  const who = args.customerName
    ? `${args.customerName} (+${args.customerPhone})`
    : `+${args.customerPhone}`;

  const body = [
    `What went wrong:`,
    reasonLabel[args.reason],
    ``,
    `Customer: ${who}`,
    `Their last message: "${args.customerLastMessage}"`,
    `Conversation state: ${args.conversationState}`,
    ``,
    `Error details:`,
    args.errorMessage,
    ``,
    `Open in dashboard: ${dashLink}`,
    ``,
    `Action: open the lead and reply manually so the customer doesn't bounce.`,
  ].join('\n');

  return {
    category: `lead_failure:${args.reason}`,
    subject: `⚠ Bot couldn't reply — ${who}`,
    body,
  };
}
