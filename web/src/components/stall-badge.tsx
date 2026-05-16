import { Clock3 } from 'lucide-react';

/** Amber pill flagging a conversation as stalled (mid-flow but quiet). */
export default function StallBadge({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  const padding = size === 'md' ? 'px-2 py-0.5 text-[11px]' : 'px-1.5 py-px text-[10px]';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-xs font-medium uppercase tracking-[0.14em] ${padding}`}
      style={{
        background:
          'color-mix(in oklab, oklch(0.75 0.16 75) 22%, var(--surface-1))',
        color: 'oklch(0.45 0.12 75)',
      }}
    >
      <Clock3 className="h-2.5 w-2.5" strokeWidth={2.5} />
      Stalled
    </span>
  );
}
