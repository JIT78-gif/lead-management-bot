import { Bot, User, UserCog } from 'lucide-react';
import type { Message } from '../lib/api.ts';
import DeliveryTick from './delivery-tick.tsx';

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function formatDay(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86400_000);
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  if (startOf(d) === startOf(today)) return 'Today';
  if (startOf(d) === startOf(yesterday)) return 'Yesterday';
  return d.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

/**
 * Renders a full WhatsApp-style conversation. Outbound (bot) on left,
 * inbound (customer) on right with a soft accent tint to draw attention.
 * Groups messages by day with subtle separators.
 */
export default function Conversation({
  messages,
  showDeliveryStatus = false,
}: {
  messages: Message[];
  /** When true, outbound bubbles render a ✓/✓✓/read/failed tick. */
  showDeliveryStatus?: boolean;
}) {
  if (messages.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border bg-surface-1 p-6 text-center text-sm text-ink-3">
        No conversation yet.
      </div>
    );
  }

  // Group by day
  const groups: Array<{ day: string; items: Message[] }> = [];
  let currentDay = '';
  for (const m of messages) {
    const day = formatDay(m.created_at);
    if (day !== currentDay) {
      currentDay = day;
      groups.push({ day, items: [] });
    }
    groups[groups.length - 1]!.items.push(m);
  }

  return (
    <div className="space-y-6">
      {groups.map((group, gi) => (
        <div key={gi} className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-ink-4">
              {group.day}
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <ul className="space-y-2">
            {group.items.map((m, i) => (
              <Bubble key={i} message={m} showDeliveryStatus={showDeliveryStatus} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function Bubble({
  message,
  showDeliveryStatus,
}: {
  message: Message;
  showDeliveryStatus: boolean;
}) {
  const isCustomer = message.direction === 'in';

  // Customer (inbound) bubbles use a theme-aware accent tint:
  //   light mode → pale peach background + dark text
  //   dark mode  → dark surface + warm orange tint + light text
  // color-mix lets one formula serve both themes by blending the accent into
  // the current surface variable.
  const customerStyle = isCustomer
    ? {
        background: 'color-mix(in oklab, var(--color-accent) 14%, var(--surface-1))',
        color: 'var(--ink)',
        border:
          '1px solid color-mix(in oklab, var(--color-accent) 28%, transparent)',
      }
    : undefined;

  const customerAvatarStyle = isCustomer
    ? {
        background:
          'color-mix(in oklab, var(--color-accent) 18%, var(--surface-1))',
        color: 'var(--color-accent)',
      }
    : undefined;

  return (
    <li
      className={`flex gap-2.5 ${isCustomer ? 'flex-row-reverse' : 'flex-row'}`}
    >
      <div
        className="grid h-7 w-7 shrink-0 place-items-center rounded-full"
        style={
          customerAvatarStyle ?? {
            background: 'var(--surface-2)',
            color: 'var(--ink-3)',
          }
        }
      >
        {isCustomer ? (
          <User className="h-3.5 w-3.5" strokeWidth={2.25} />
        ) : message.sent_by === 'human' ? (
          <UserCog className="h-3.5 w-3.5" strokeWidth={2.25} />
        ) : (
          <Bot className="h-3.5 w-3.5" strokeWidth={2.25} />
        )}
      </div>

      <div className={`max-w-[78%] sm:max-w-[68%] ${isCustomer ? 'items-end' : 'items-start'} flex flex-col`}>
        <div
          className={`rounded-md px-3.5 py-2.5 text-[14px] leading-snug ${
            isCustomer
              ? 'rounded-tr-xs'
              : 'rounded-tl-xs border border-border bg-surface-1'
          }`}
          style={customerStyle}
        >
          <p className="whitespace-pre-wrap wrap-break-word">{message.text}</p>
        </div>
        <span className="mt-1 inline-flex items-center gap-1.5 text-[10px] font-mono text-ink-4 tabular">
          {!isCustomer && message.sent_by === 'human' && (
            <span
              className="rounded-xs px-1 py-px text-[9px] font-medium uppercase tracking-[0.14em] not-italic"
              style={{
                background:
                  'color-mix(in oklab, var(--color-accent) 14%, transparent)',
                color: 'var(--color-accent)',
              }}
            >
              You
            </span>
          )}
          {formatTime(message.created_at)}
          {!isCustomer && showDeliveryStatus && (
            <DeliveryTick
              status={message.delivery_status}
              error={message.delivery_error}
            />
          )}
        </span>
      </div>
    </li>
  );
}
