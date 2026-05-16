import { Link } from 'react-router';
import { ChevronRight } from 'lucide-react';
import type { ConversationListItem } from '../lib/api.ts';
import { formatPhone, timeAgo } from '../lib/format.ts';
import ConvoStateBadge from './convo-state-badge.tsx';
import StallBadge from './stall-badge.tsx';

/** One row in the Chats list. */
export default function ConversationCard({
  convo,
}: {
  convo: ConversationListItem;
}) {
  const name = convo.whatsapp_name?.trim() || formatPhone(convo.phone);
  const last = convo.last_message_text?.trim();
  const lastAt = convo.last_message_at ?? convo.updated_at;
  const lastIsCustomer = convo.last_message_direction === 'in';

  // Truncate manually so it works in flex-min-width contexts without CSS quirks
  const snippet = last
    ? last.length > 120
      ? last.slice(0, 120).trim() + '…'
      : last
    : '(no messages)';

  return (
    <Link
      to={`/chats/${convo.phone}`}
      className="group relative flex items-start gap-3 overflow-hidden rounded-md border border-border bg-surface-1 p-4 transition-colors hover:bg-surface-2 sm:p-5"
    >
      {/* Accent stripe when the bot owes a reply */}
      {convo.is_waiting_on_bot && (
        <div
          aria-hidden
          className="absolute inset-y-0 left-0 w-px"
          style={{ background: 'var(--color-accent)' }}
        />
      )}

      <div className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface-2 font-display text-sm font-medium text-ink-2 sm:h-11 sm:w-11">
        {name.replace(/[^A-Za-z]/g, '').charAt(0).toUpperCase() || '·'}
        {convo.is_waiting_on_bot && (
          <span
            className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-surface-1"
            style={{ background: 'var(--color-accent)' }}
            title="Bot hasn't replied yet"
          />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate text-sm font-medium text-ink">{name}</span>
          {convo.whatsapp_name && (
            <span className="font-mono text-[11px] text-ink-4">
              {formatPhone(convo.phone)}
            </span>
          )}
          <span className="ml-auto text-[11px] text-ink-4">{timeAgo(lastAt)}</span>
        </div>

        <p className="mt-1 truncate text-[13px] leading-snug text-ink-2">
          <span className="text-ink-4">
            {lastIsCustomer ? 'They: ' : convo.last_message_direction === 'out' ? 'Bot: ' : ''}
          </span>
          {snippet}
        </p>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <ConvoStateBadge state={convo.state} />
          {convo.is_stalled && <StallBadge />}
          <span className="ml-auto inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.16em] text-ink-4">
            {convo.inbound_count + convo.outbound_count} msg
          </span>
        </div>
      </div>

      <ChevronRight
        className="mt-1 h-4 w-4 shrink-0 text-ink-4 transition-transform group-hover:translate-x-0.5"
        strokeWidth={2}
      />
    </Link>
  );
}
