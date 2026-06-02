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

  // Sniff the error message for known patterns and surface a sharper
  // diagnosis + recommended action. Saves the owner ten minutes of
  // Googling what "Lightning dunning" means at 2 AM.
  const classified = classifyError(args.errorMessage);

  const body = [
    `What went wrong:`,
    reasonLabel[args.reason],
    classified.diagnosis ? `\n${classified.diagnosis}` : '',
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
    `Action: ${classified.action}`,
  ].filter(Boolean).join('\n');

  return {
    // Different category for known root causes so throttling doesn't
    // collapse a "billing block" with a normal gemini hiccup.
    category: `lead_failure:${args.reason}:${classified.tag}`,
    subject: classified.subject ?? `⚠ Bot couldn't reply — ${who}`,
    body,
  };
}

interface Classified {
  tag: string;
  diagnosis: string | null;
  action: string;
  subject: string | null;
}

function classifyError(errorMessage: string): Classified {
  const msg = errorMessage.toLowerCase();

  // Google Cloud billing block. Their internal name for the dunning /
  // collection system is "Lightning". 403 PERMISSION_DENIED with that
  // word means the project's API access has been cut off for billing.
  if (
    msg.includes('lightning dunning') ||
    (msg.includes('permission_denied') && msg.includes('billing')) ||
    msg.includes('billing account')
  ) {
    return {
      tag: 'billing_block',
      subject: '⚠ Gemini API blocked — check Google Cloud billing',
      diagnosis:
        'Google Cloud has blocked your project from calling the Gemini API. ' +
        'This is almost always a billing issue: unpaid invoice, failed payment ' +
        'method, or free credits exhausted without a paid account set up.',
      action:
        '1) Open https://console.cloud.google.com/billing\n' +
        '2) Find the billing account linked to the project named in the error\n' +
        '3) Resolve any unpaid invoice / failed payment method\n' +
        '4) (Fastest unblock) Generate a fresh GEMINI_API_KEY on a different ' +
        'project with working billing, paste it into Easypanel, redeploy.',
    };
  }

  // Quota / rate limit exhaustion — different from billing block.
  if (
    msg.includes('quota') ||
    msg.includes('resource_exhausted') ||
    msg.includes('429')
  ) {
    return {
      tag: 'quota',
      subject: '⚠ Gemini quota exhausted — bot is rate-limited',
      diagnosis:
        'Hit a Gemini quota or rate limit. If on the free tier, you may have ' +
        'burned through the per-minute or per-day budget.',
      action:
        'Wait a few minutes (per-minute quota resets fast) or enable a paid ' +
        'billing account on the Google Cloud project for higher limits.',
    };
  }

  // Invalid / revoked API key.
  if (
    msg.includes('api key not valid') ||
    msg.includes('api_key_invalid') ||
    msg.includes('invalid_argument') ||
    msg.includes('401') ||
    msg.includes('unauthenticated')
  ) {
    return {
      tag: 'auth',
      subject: '⚠ Gemini API key invalid — bot is offline',
      diagnosis:
        'Gemini rejected the API key. It may have been revoked, deleted, or ' +
        "incorrectly pasted (extra whitespace, missing characters).",
      action:
        'Generate a fresh API key at https://aistudio.google.com/apikey, ' +
        'paste it into Easypanel as GEMINI_API_KEY, redeploy.',
    };
  }

  // Default — generic failure. Owner takes over manually.
  return {
    tag: 'generic',
    subject: null,
    diagnosis: null,
    action: "open the lead and reply manually so the customer doesn't bounce.",
  };
}
