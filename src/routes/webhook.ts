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
  getConversation,
  getOrCreateConversation,
  listMessages,
  saveQualifiedLead,
  setConversationRouting,
  updateConversation,
  type ConversationState,
} from '../services/leads.js';
import { notifyNewChat, notifySalesteam } from '../services/notify.js';
import { sendAlert, leadFailureAlert } from '../services/alert.js';
import { detectCountry } from '../services/country-detect.js';
import { detectNiche } from '../services/niche-detect.js';
import { isConnected as googleConnected } from '../services/google-oauth.js';
import { advanceBooking, startBooking } from '../services/meet-booking.js';
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

  // Detect whether this is the very first message ever from this phone.
  // We need to know BEFORE getOrCreateConversation creates the row.
  const isBrandNewChat = getConversation(msg.phone) === undefined;

  // Ensure conversation exists.
  const conv = getOrCreateConversation(msg.phone, msg.whatsappName);
  log.info({ phone: msg.phone, state: conv.state, isBrandNewChat }, 'conversation state');

  // Phase 7 — stamp the conversation with detected country + niche on the
  // very first inbound. Country comes from the phone prefix; niche comes
  // from keyword-matching the customer's first message (which Meta ads
  // pre-fill per campaign). Both are cheap, deterministic, server-side.
  let routedCountry = detectCountry(msg.phone);
  let routedNiche = detectNiche(msg.text);

  // Testing override: phones in TEST_INTERNATIONAL_PHONES get treated
  // as international (Meet booking flow) regardless of their actual
  // country code. Used to dry-run the international flow with an
  // Indian +91 number before pointing real overseas ads at the bot.
  if (config.testing.forceInternationalPhones.includes(msg.phone)) {
    routedCountry = { ...routedCountry, isIndia: false };
    log.info(
      { phone: msg.phone },
      'TEST override: routing this Indian number as international'
    );
  }
  if (isBrandNewChat) {
    setConversationRouting(msg.phone, routedCountry.code, routedNiche);
    log.info(
      { phone: msg.phone, country: routedCountry.code, niche: routedNiche },
      'first inbound: stamped country + niche on conversation'
    );
  } else {
    // Re-use what was already stored so the prompt sees a stable value
    // even if the customer's later messages don't repeat the niche
    // keyword.
    if (conv.country_code) {
      routedCountry = detectCountry(msg.phone); // re-derive for `name` + `flag`
    }
    if (conv.niche) {
      routedNiche = conv.niche as ReturnType<typeof detectNiche>;
    }
  }

  // Fire-and-forget salesperson nudge on the first ever message.
  // Don't await — the bot's reply shouldn't block on this.
  if (isBrandNewChat) {
    notifyNewChat(msg.phone, msg.whatsappName, msg.text, log).catch(() => {});
  }

  // Idempotency: if we've already seen this Meta message id, skip the whole turn.
  const isNew = appendMessage(msg.phone, 'in', msg.text, msg.metaMessageId);
  if (!isNew) {
    log.info({ phone: msg.phone, metaId: msg.metaMessageId }, 'duplicate webhook, silent skip');
    return;
  }

  // Manual takeover: the salesperson has paused the bot for this number
  // (Phase 6.5 "Take over chat" feature). Store the inbound message so the
  // dashboard shows it live, then stay silent. The human is replying now.
  if (conv.bot_paused) {
    log.info({ phone: msg.phone }, 'conversation under manual takeover, bot silent');
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

  // Phase 8 — if we're mid-booking, route to the deterministic state
  // machine instead of running another LLM turn. The LLM stops being
  // useful once we've started the calendar dance.
  if (conv.meet_status && ['awaiting_time', 'awaiting_alt_confirm', 'awaiting_email'].includes(conv.meet_status)) {
    log.info({ phone: msg.phone, meet_status: conv.meet_status }, 'advancing meet booking');
    const result = await advanceBooking(
      conv,
      msg.text,
      msg.whatsappName ?? conv.whatsapp_name,
      log
    );

    if (result.kind === 'reply') {
      await sendAndLog(msg.phone, result.text);
      return;
    }

    if (result.kind === 'finished') {
      // Save the lead now that the booking is locked in. We pull
      // the latest conversation row so saveQualifiedLead picks up
      // the meet_event_id / link / email we just stamped.
      const finalConv = getConversation(msg.phone);
      const collected = finalConv ? safeParseCollected(finalConv.collected) : {};
      saveQualifiedLead(msg.phone, {
        name: collected.name ?? null,
        industry: collected.industry ?? null,
        team_size: collected.team_size ?? null,
        website_url: collected.website_url ?? null,
        social_handle: collected.social_handle ?? null,
        niche_detail: collected.niche_detail ?? null,
        ...result.patch,
      });
      updateConversation(msg.phone, 'qualified', {
        name: collected.name ?? null,
        industry: collected.industry ?? null,
        team_size: collected.team_size ?? null,
        website_url: collected.website_url ?? null,
        social_handle: collected.social_handle ?? null,
      });
      notifySalesteam(
        msg.phone,
        {
          name: collected.name ?? null,
          industry: collected.industry ?? null,
          team_size: collected.team_size ?? null,
          website_url: collected.website_url ?? null,
          social_handle: collected.social_handle ?? null,
          niche_detail: collected.niche_detail ?? null,
          meet_preferred_time: collected.meet_preferred_time ?? null,
        },
        log
      ).catch(() => {});
      await sendAndLog(msg.phone, result.text);
      return;
    }

    // fallback_manual — preserve Phase 7 behavior: ask the customer
    // for a preferred time (text) and let the salesperson book by hand.
    await sendAndLog(
      msg.phone,
      "Our team will reach out shortly with a Google Meet invite. Talk soon!"
    );
    const finalConv = getConversation(msg.phone);
    const collected = finalConv ? safeParseCollected(finalConv.collected) : {};
    saveQualifiedLead(msg.phone, {
      name: collected.name ?? null,
      industry: collected.industry ?? null,
      team_size: collected.team_size ?? null,
      website_url: collected.website_url ?? null,
      social_handle: collected.social_handle ?? null,
      niche_detail: collected.niche_detail ?? null,
      meet_preferred_time: result.text || collected.meet_preferred_time || null,
    });
    updateConversation(msg.phone, 'qualified', {
      name: collected.name ?? null,
      industry: collected.industry ?? null,
      team_size: collected.team_size ?? null,
      website_url: collected.website_url ?? null,
      social_handle: collected.social_handle ?? null,
    });
    return;
  }

  log.info({ phone: msg.phone, state: conv.state }, 'running Gemini turn');

  // Build conversation history (only customer-visible turns, no the just-inserted
  // inbound message gets included automatically by listMessages).
  const history = listMessages(msg.phone);

  let turn;
  try {
    turn = await runTurn(
      history,
      msg.whatsappName ?? conv.whatsapp_name,
      conv.state,
      log,
      { country: routedCountry, niche: routedNiche }
    );
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
    // Phase 8 — for international leads with Google connected, DON'T
    // save yet. Stamp the conversation collected data, start the meet
    // booking sub-flow, and override the LLM's reply with the booking
    // question. Lead is saved later when the state machine finishes.
    if (!routedCountry.isIndia && googleConnected()) {
      log.info({ phone: msg.phone }, 'intercepting QUALIFY_AND_SAVE for Meet booking');
      // Stash collected data on the conversation row so we can pull
      // it later when saveQualifiedLead actually runs.
      updateConversation(msg.phone, 'collecting', finalData);
      // Re-fetch the conversation so startBooking sees the freshest row.
      const freshConv = getConversation(msg.phone) ?? conv;
      const bookingResult = startBooking(freshConv);
      const reply =
        bookingResult.kind === 'reply' ? bookingResult.text : turn.reply;
      try {
        await sendAndLog(msg.phone, reply);
      } catch (err) {
        sendAlert(
          leadFailureAlert({
            reason: 'send_failed',
            customerPhone: msg.phone,
            customerName: msg.whatsappName ?? conv.whatsapp_name,
            customerLastMessage: msg.text,
            conversationState: 'collecting',
            errorMessage: err instanceof Error ? err.message : String(err),
          }),
          log
        );
        throw err;
      }
      return;
    }

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

// Best-effort JSON parse for the `collected` blob stored on the
// conversation row. Returns {} for any parse failure so the caller
// always gets an object.
function safeParseCollected(s: string | null | undefined): {
  name?: string | null;
  industry?: string | null;
  team_size?: 'solo' | '2-5' | '6-10' | '11-25' | '25+' | null;
  website_url?: string | null;
  social_handle?: string | null;
  niche_detail?: string | null;
  meet_preferred_time?: string | null;
} {
  if (!s) return {};
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}
