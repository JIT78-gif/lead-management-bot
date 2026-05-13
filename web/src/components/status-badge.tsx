import {
  Sparkle,
  PhoneOutgoing,
  Flame,
  Snowflake,
  Trophy,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import type { LeadStatus } from '../lib/api.ts';

interface StatusDef {
  label: string;
  Icon: LucideIcon;
  // Tailwind utility classes — using raw color tokens so badges keep their
  // identity in both light and dark modes.
  fg: string;
  bg: string;
  ring: string;
}

const STATUS_MAP: Record<LeadStatus, StatusDef> = {
  new_qualified: {
    label: 'New',
    Icon: Sparkle,
    fg: 'text-[var(--color-blue)]',
    bg: 'bg-[var(--color-blue-soft)] dark:bg-[var(--color-blue)]/12',
    ring: 'ring-[var(--color-blue)]/20',
  },
  contacted: {
    label: 'Contacted',
    Icon: PhoneOutgoing,
    fg: 'text-[var(--color-amber)]',
    bg: 'bg-[var(--color-amber-soft)] dark:bg-[var(--color-amber)]/12',
    ring: 'ring-[var(--color-amber)]/20',
  },
  hot: {
    label: 'Hot',
    Icon: Flame,
    fg: 'text-[var(--color-accent)]',
    bg: 'bg-[var(--color-accent-soft)] dark:bg-[var(--color-accent)]/12',
    ring: 'ring-[var(--color-accent)]/25',
  },
  cold: {
    label: 'Cold',
    Icon: Snowflake,
    fg: 'text-[var(--color-slate)]',
    bg: 'bg-[var(--color-slate-soft)] dark:bg-[var(--color-slate)]/15',
    ring: 'ring-[var(--color-slate)]/20',
  },
  won: {
    label: 'Won',
    Icon: Trophy,
    fg: 'text-[var(--color-emerald)]',
    bg: 'bg-[var(--color-emerald-soft)] dark:bg-[var(--color-emerald)]/12',
    ring: 'ring-[var(--color-emerald)]/20',
  },
  lost: {
    label: 'Lost',
    Icon: XCircle,
    fg: 'text-ink-3',
    bg: 'bg-surface-2',
    ring: 'ring-border',
  },
};

export default function StatusBadge({
  status,
  size = 'md',
}: {
  status: LeadStatus;
  size?: 'sm' | 'md';
}) {
  const def = STATUS_MAP[status];
  const Icon = def.Icon;
  const pad = size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs';
  const icon = size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5';
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-sm font-medium ring-1 ring-inset ${pad} ${def.fg} ${def.bg} ${def.ring}`}
    >
      <Icon className={icon} strokeWidth={2.25} />
      {def.label}
    </span>
  );
}
