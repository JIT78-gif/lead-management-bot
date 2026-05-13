import { Flame, Sun, Snowflake, XCircle, type LucideIcon } from 'lucide-react';
import type { CallVerdict } from '../lib/api.ts';

interface VerdictDef {
  label: string;
  Icon: LucideIcon;
  // CSS variable name for the accent color of this verdict
  color: string;
}

const VERDICT_MAP: Record<CallVerdict, VerdictDef> = {
  hot: {
    label: 'Hot',
    Icon: Flame,
    color: 'var(--color-accent)',
  },
  warm: {
    label: 'Warm',
    Icon: Sun,
    color: 'var(--color-amber)',
  },
  cold: {
    label: 'Cold',
    Icon: Snowflake,
    color: 'var(--color-blue)',
  },
  not_interested: {
    label: 'Not interested',
    Icon: XCircle,
    color: 'var(--ink-3)',
  },
};

interface Props {
  verdict: CallVerdict;
  confidence?: number | null;
  size?: 'sm' | 'md';
}

export default function VerdictBadge({ verdict, confidence, size = 'sm' }: Props) {
  const def = VERDICT_MAP[verdict];
  const Icon = def.Icon;

  const pad = size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs';
  const icon = size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5';

  // Theme-aware tint: blend the verdict color into the current surface.
  const background = `color-mix(in oklab, ${def.color} 14%, var(--surface-1))`;
  const border = `color-mix(in oklab, ${def.color} 28%, transparent)`;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-sm font-medium ring-1 ring-inset ${pad}`}
      style={{
        color: def.color,
        background,
        boxShadow: `inset 0 0 0 1px ${border}`,
      }}
    >
      <Icon className={icon} strokeWidth={2.25} />
      {def.label}
      {confidence !== null && confidence !== undefined && confidence < 0.7 && (
        <span className="font-mono opacity-70 tabular">
          · {Math.round(confidence * 100)}%
        </span>
      )}
    </span>
  );
}
