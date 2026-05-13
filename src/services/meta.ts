import { config } from '../config.js';

const baseUrl = `https://graph.facebook.com/${config.meta.graphApiVersion}/${config.meta.phoneNumberId}`;

export interface IncomingMessage {
  phone: string;
  whatsappName: string | null;
  text: string;
  metaMessageId: string;
}

/**
 * Send a plain-text WhatsApp message to a phone number.
 * Returns the Meta-issued message ID on success, throws on failure.
 */
export async function sendText(phone: string, text: string): Promise<string> {
  const res = await fetch(`${baseUrl}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.meta.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: phone,
      type: 'text',
      text: { body: text, preview_url: false },
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Meta sendText failed (${res.status}): ${errBody}`);
  }

  const json = (await res.json()) as { messages?: Array<{ id: string }> };
  const id = json.messages?.[0]?.id;
  if (!id) throw new Error('Meta sendText: no message id in response');
  return id;
}

/**
 * Extracts incoming text messages from a Meta webhook POST body.
 * Ignores statuses, reactions, non-text messages (returns []).
 */
export function parseIncomingWebhook(body: unknown): IncomingMessage[] {
  const result: IncomingMessage[] = [];
  const entries = (body as { entry?: unknown[] })?.entry;
  if (!Array.isArray(entries)) return result;

  for (const entry of entries) {
    const changes = (entry as { changes?: unknown[] })?.changes;
    if (!Array.isArray(changes)) continue;

    for (const change of changes) {
      const value = (change as { value?: unknown })?.value as
        | {
            messages?: Array<{
              id?: string;
              from?: string;
              type?: string;
              text?: { body?: string };
            }>;
            contacts?: Array<{
              wa_id?: string;
              profile?: { name?: string };
            }>;
          }
        | undefined;

      if (!value?.messages) continue;

      const profileNameByPhone = new Map<string, string>();
      for (const contact of value.contacts ?? []) {
        if (contact.wa_id && contact.profile?.name) {
          profileNameByPhone.set(contact.wa_id, contact.profile.name);
        }
      }

      for (const m of value.messages) {
        if (m.type !== 'text' || !m.from || !m.id || !m.text?.body) continue;
        result.push({
          phone: m.from,
          whatsappName: profileNameByPhone.get(m.from) ?? null,
          text: m.text.body,
          metaMessageId: m.id,
        });
      }
    }
  }

  return result;
}
