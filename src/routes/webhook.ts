import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';
import {
  parseIncomingWebhook,
  parseIncomingStatuses,
  sendText,
} from '../services/meta.js';
import { runTurn } from '../services/gemini.js';
import {
  appendMessage,
  applyStatusUpdate,
  getOrCreateConversation,
  listMessages,
  saveQualifiedLead,
  updateConversation,
  type ConversationState,
} from '../services/leads.js';
import { notifySalesteam } from '../services/notify.js';
import { sendAlert, leadFailureAlert } from '../services/alert.js';
import { chooseBestName, normaliseDisplayName } from '../services/name-sanitize.js';

const FALLBACK_REPLY =
  "One sec, I'm having a small issue. Could you please send your message again?";

export async function webhookRoutes(app: FastifyInstance): Promise<void> {
  // Meta webhook verification (one-time, on subscription).
  app.get<{
    Querystring: {
      'hub.mode'?: string;
      'hub.verify_token'?: string;
      'hub.challenge'?: string;
    };
  }>('/webhook', async (req, reply) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === config.meta.verifyToken && challenge) {
      reply.type('text/plain').send(challenge);
      return;
    }
    reply.code(403).send('Forbidden');
  });

  // Meta delivers all WhatsApp events here (incoming messages, statuses, etc).
  // ACK immediately so Meta doesn't retry; process the message async.
  app.post('/webhook', (req, reply) => {
    // TEMP DEBUG: dump raw body so we can see what Meta is actually sending.
    app.log.info({ body: req.body }, 'webhook body received');

    reply.code(200).send('OK');

    setImmediate(() => {
      try {
        const incoming = parseIncomingWebhook(req.body);
        const statuses = parseIncomingStatuses(req.body);
        app.log.info(
          { parsedCount: incoming.length, statusCount: statuses.length },
          'webhook parsed'
        );

        // Phase 6: persist delivery-status updates so the dashboard can
        // show real ✓ / ✓✓ / read / failed ticks per outbound message.
        for (const s of statuses) {
          const changed = applyStatusUpdate(
            s.metaMessageId,
            s.status,
            s.errorMessage,
            s.timestampMs
          );
          if (s.status === 'failed') {
            app.log.warn(
              { metaId: s.metaMessageId, errorCode: s.errorCode, errorMessage: s.errorMessage },
              'outbound message failed'
            );
          } else if (changed) {
            app.log.debug(
              { metaId: s.metaMessageId, status: s.status },
              'delivery status updated'
            );
          }
        }

        for (const msg of incoming) {
          processMessage(msg, app.log).catch((err) => {
            app.log.error({ err, phone: msg.phone }, 'processMessage failed');
          });
        }
      } catch (err) {
        app.log.error({ err }, 'webhook parse failed');
      }
    });
  });

  app.get('/healthz', async () => ({ ok: true }));

  // Bare domain → dashboard. Lets users type whatsapp.botifys.com and land
  // on the login page without having to remember /dashboard/login.
  app.get('/', async (_req, reply) => {
    reply.redirect('/dashboard/', 302);
  });
}

async function processMessage(
  msg: {
    phone: string;
    whatsappName: string | null;
    text: string;
    metaMessageId: string;
  },
  log: import('fastify').FastifyBaseLogger
): Promise<void> {
  log.info(
    { phone: msg.phone, text: msg.text, metaId: msg.metaMessageId },
    'processMessage start'
  );

  // Ensure conversation exists.
  const conv = getOrCreateConversation(msg.phone, msg.whatsappName);
  log.info({ phone: msg.phone, state: conv.state }, 'conversation state');

  // Idempotency: if we've already seen this Meta message id, skip the whole turn.
  const isNew = appendMessage(msg.phone, 'in', msg.text, msg.metaMessageId);
  if (!isNew) {
    log.info({ phone: msg.phone, metaId: msg.metaMessageId }, 'duplicate webhook, silent skip');
    return;
  }

  // Disqualified leads are silent. Don't burn Gemini calls on them.
  if (conv.state === 'disqualified') {
    log.info({ phone: msg.phone }, 'conversation disqualified, silent skip');
    return;
  }

  // Already-qualified leads get one reassurance line, no flow restart.
  if (conv.state === 'qualified') {
    log.info({ phone: msg.phone }, 'conversation qualified, sending ack');
    const ack = "Thanks! Our team will be in touch soon.";
    await sendAndLog(msg.phone, ack);
    return;
  }

  log.info({ phone: msg.phone, state: conv.state }, 'running Gemini turn');

  // Build conversation history (only customer-visible turns, no the just-inserted
  // inbound message gets included automatically by listMessages).
  const history = listMessages(msg.phone);

  let turn;
  try {
    turn = await runTurn(history, msg.whatsappName ?? conv.whatsapp_name, conv.state);
  } catch (err) {
    // Gemini fully failed (twice) — apologise so the customer isn't stranded.
    await sendAndLog(msg.phone, FALLBACK_REPLY).catch(() => {});

    // Alert the owner so they can take over manually before the customer bounces.
    sendAlert(
      leadFailureAlert({
        reason: 'gemini_failed',
        customerPhone: msg.phone,
        customerName: msg.whatsappName ?? conv.whatsapp_name,
        customerLastMessage: msg.text,
        conversationState: conv.state,
        errorMessage: err instanceof Error ? err.message : String(err),
      }),
      log
    );

    throw err;
  }

  // Safety net: customers sometimes type junk ("yes", "automation", "ok")
  // as their name. The WhatsApp profile name is far more reliable since
  // they set it themselves on their phone. Prefer it whenever Gemini's
  // extracted name fails a basic sanity check.
  const whatsappProfileName = msg.whatsappName ?? conv.whatsapp_name;
  const bestName = chooseBestName(turn.data.name, whatsappProfileName);
  const finalData = {
    ...turn.data,
    name: bestName ? normaliseDisplayName(bestName) : null,
  };
  if (finalData.name !== turn.data.name) {
    log.info(
      {
        phone: msg.phone,
        extracted: turn.data.name,
        chosen: finalData.name,
        whatsapp_profile_name: whatsappProfileName,
      },
      'overrode lead name (used WhatsApp profile name)'
    );
  }

  // Decide next state.
  let nextState: ConversationState = conv.state as ConversationState;
  if (turn.action === 'DISQUALIFY') {
    nextState = 'disqualified';
  } else if (turn.action === 'QUALIFY_AND_SAVE') {
    nextState = 'qualified';
    saveQualifiedLead(msg.phone, finalData);
    // Fire-and-forget: notify each salesperson on WhatsApp. Don't block the
    // bot's reply on this — failures (e.g. closed 24h window) are logged.
    notifySalesteam(msg.phone, finalData, log).catch(() => {});
  } else {
    // ASK_NEXT — still collecting.
    nextState = 'collecting';
  }

  updateConversation(msg.phone, nextState, finalData, msg.whatsappName);

  log.info(
    { phone: msg.phone, action: turn.action, nextState, replyLen: turn.reply?.length ?? 0 },
    'Gemini turn complete'
  );

  // Send the reply (skip if intentionally empty — e.g. silent after disqualify).
  if (turn.reply && turn.reply.trim() !== '') {
    try {
      await sendAndLog(msg.phone, turn.reply);
      log.info({ phone: msg.phone }, 'reply sent successfully');
    } catch (err) {
      // Meta rejected the send. The customer got nothing. Alert the owner.
      sendAlert(
        leadFailureAlert({
          reason: 'send_failed',
          customerPhone: msg.phone,
          customerName: msg.whatsappName ?? conv.whatsapp_name,
          customerLastMessage: msg.text,
          conversationState: nextState,
          errorMessage: err instanceof Error ? err.message : String(err),
        }),
        log
      );
      throw err;
    }
  }
}

async function sendAndLog(phone: string, text: string): Promise<void> {
  const metaId = await sendText(phone, text);
  appendMessage(phone, 'out', text, metaId);
}
