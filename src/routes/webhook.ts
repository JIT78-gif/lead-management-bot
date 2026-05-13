import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';
import { parseIncomingWebhook, sendText } from '../services/meta.js';
import { runTurn } from '../services/gemini.js';
import {
  appendMessage,
  getOrCreateConversation,
  listMessages,
  saveQualifiedLead,
  updateConversation,
  type ConversationState,
} from '../services/leads.js';

const FALLBACK_REPLY =
  "One sec — I'm having a small issue. Could you please send your message again?";

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
    reply.code(200).send('OK');

    setImmediate(() => {
      try {
        const incoming = parseIncomingWebhook(req.body);
        for (const msg of incoming) {
          processMessage(msg).catch((err) => {
            app.log.error({ err, phone: msg.phone }, 'processMessage failed');
          });
        }
      } catch (err) {
        app.log.error({ err }, 'webhook parse failed');
      }
    });
  });

  app.get('/healthz', async () => ({ ok: true }));
}

async function processMessage(msg: {
  phone: string;
  whatsappName: string | null;
  text: string;
  metaMessageId: string;
}): Promise<void> {
  // Ensure conversation exists.
  const conv = getOrCreateConversation(msg.phone, msg.whatsappName);

  // Idempotency: if we've already seen this Meta message id, skip the whole turn.
  const isNew = appendMessage(msg.phone, 'in', msg.text, msg.metaMessageId);
  if (!isNew) return;

  // Disqualified leads are silent. Don't burn Gemini calls on them.
  if (conv.state === 'disqualified') return;

  // Already-qualified leads get one reassurance line, no flow restart.
  if (conv.state === 'qualified') {
    const ack = "Thanks! Our team will be in touch soon.";
    await sendAndLog(msg.phone, ack);
    return;
  }

  // Build conversation history (only customer-visible turns, no the just-inserted
  // inbound message gets included automatically by listMessages).
  const history = listMessages(msg.phone);

  let turn;
  try {
    turn = await runTurn(history, msg.whatsappName ?? conv.whatsapp_name, conv.state);
  } catch (err) {
    // Gemini fully failed (twice) — apologise so the customer isn't stranded.
    await sendAndLog(msg.phone, FALLBACK_REPLY);
    throw err;
  }

  // Decide next state.
  let nextState: ConversationState = conv.state as ConversationState;
  if (turn.action === 'DISQUALIFY') {
    nextState = 'disqualified';
  } else if (turn.action === 'QUALIFY_AND_SAVE') {
    nextState = 'qualified';
    saveQualifiedLead(msg.phone, turn.data);
  } else {
    // ASK_NEXT — still collecting.
    nextState = 'collecting';
  }

  updateConversation(msg.phone, nextState, turn.data, msg.whatsappName);

  // Send the reply (skip if intentionally empty — e.g. silent after disqualify).
  if (turn.reply && turn.reply.trim() !== '') {
    await sendAndLog(msg.phone, turn.reply);
  }
}

async function sendAndLog(phone: string, text: string): Promise<void> {
  const metaId = await sendText(phone, text);
  appendMessage(phone, 'out', text, metaId);
}
