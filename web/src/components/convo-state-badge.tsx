import { Sparkles, MessageSquare, CheckCircle2, XCircle } from 'lucide-react';
import type { ConversationState } from '../lib/api.ts';

interface State {
  label: string;
  Icon: typeof Sparkles;
  bg: string;
  fg: string;
  border: string;
}

function styleFor(state: ConversationState): State {
  switch (state) {
    case 'qualifying':
      return {
        label: 'Greeting',
        Icon: Sparkles,
        bg: 'color-mix(in oklab, var(--color-accent) 10%, var(--surface-1))',
        fg: 'var(--color-accent)',
        border:
          'color-mix(in oklab, var(--color-accent) 28%, transparent)',
      };
    case 'collecting':
      return {
        label: 'Collecting',
        Icon: MessageSquare,
        bg: 'color-mix(in oklab, oklch(0.7 0.13 240) 14%, var(--surface-1))',
        fg: 'oklch(0.45 0.13 240)',
        border:
          'color-mix(in oklab, oklch(0.7 0.13 240) 28%, transparent)',
      };
    case 'qualified':
      return {
        label: 'Qualified',
        Icon: CheckCircle2,
        bg: 'color-mix(in oklab, oklch(0.72 0.15 145) 14%, var(--surface-1))',
        fg: 'oklch(0.42 0.13 145)',
        border:
          'color-mix(in oklab, oklch(0.72 0.15 145) 28%, transparent)',
      };
    case 'disqualified':
      return {
        label: 'Disqualified',
        Icon: XCircle,
        bg: 'var(--surface-2)',
        fg: 'var(--ink-3)',
        border: 'var(--border)',
      };
  }
}

export default function ConvoStateBadge({
  state,
  size = 'sm',
}: {
  state: ConversationState;
  size?: 'sm' | 'md';
}) {
  const s = styleFor(state);
  const padding = size === 'md' ? 'px-2 py-0.5 text-[11px]' : 'px-1.5 py-px text-[10px]';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-xs border font-medium uppercase tracking-[0.14em] ${padding}`}
      style={{ background: s.bg, color: s.fg, borderColor: s.border }}
    >
      <s.Icon className="h-2.5 w-2.5" strokeWidth={2.5} />
      {s.label}
    </span>
  );
}
