import { Check, CheckCheck, AlertTriangle } from 'lucide-react';
import type { DeliveryStatus } from '../lib/api.ts';

/**
 * WhatsApp-style delivery indicator for outbound bot messages.
 *   sent       →  ✓
 *   delivered  →  ✓✓
 *   read       →  ✓✓ in accent
 *   failed     →  ⚠ in accent (with optional tooltip via title)
 *
 * Inbound or pre-Phase-6 outbound rows render nothing.
 */
export default function DeliveryTick({
  status,
  error,
}: {
  status?: DeliveryStatus | null;
  error?: string | null;
}) {
  if (!status) return null;

  if (status === 'failed') {
    return (
      <span
        className="inline-flex items-center"
        style={{ color: 'var(--color-accent)' }}
        title={error ?? 'Meta rejected this message'}
        aria-label="Send failed"
      >
        <AlertTriangle className="h-3 w-3" strokeWidth={2.25} />
      </span>
    );
  }

  if (status === 'sent') {
    return (
      <span className="inline-flex items-center text-ink-4" title="Sent" aria-label="Sent">
        <Check className="h-3 w-3" strokeWidth={2.25} />
      </span>
    );
  }

  if (status === 'delivered') {
    return (
      <span
        className="inline-flex items-center text-ink-4"
        title="Delivered"
        aria-label="Delivered"
      >
        <CheckCheck className="h-3 w-3" strokeWidth={2.25} />
      </span>
    );
  }

  // read
  return (
    <span
      className="inline-flex items-center"
      style={{ color: 'var(--color-accent)' }}
      title="Read"
      aria-label="Read"
    >
      <CheckCheck className="h-3 w-3" strokeWidth={2.25} />
    </span>
  );
}
