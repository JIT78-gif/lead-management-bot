import { countryInfo, nicheLabel } from '../lib/country-niche.ts';

/**
 * Phase 7 — small inline display of a conversation/lead's country flag
 * and niche category. Renders nothing for missing data so it can be
 * dropped into existing card layouts without visual noise on legacy
 * rows that pre-date the migration.
 */
export default function CountryNichePills({
  countryCode,
  niche,
  size = 'sm',
}: {
  countryCode?: string | null;
  niche?: string | null;
  size?: 'sm' | 'md';
}) {
  const c = countryCode ? countryInfo(countryCode) : null;
  const n = nicheLabel(niche);
  if (!c && !n) return null;

  const padding =
    size === 'md' ? 'px-2 py-0.5 text-[11px]' : 'px-1.5 py-px text-[10px]';

  return (
    <span className="inline-flex items-center gap-1.5">
      {c && (
        <span
          className={`inline-flex items-center gap-1 rounded-xs border border-border bg-surface-2 font-medium uppercase tracking-[0.14em] text-ink-2 ${padding}`}
          title={c.name}
        >
          <span aria-hidden>{c.flag}</span>
          <span>{c.name}</span>
        </span>
      )}
      {n && (
        <span
          className={`inline-flex items-center rounded-xs font-medium uppercase tracking-[0.14em] ${padding}`}
          style={{
            background:
              'color-mix(in oklab, var(--color-accent) 12%, var(--surface-1))',
            color: 'var(--color-accent)',
            border:
              '1px solid color-mix(in oklab, var(--color-accent) 28%, transparent)',
          }}
        >
          {n}
        </span>
      )}
    </span>
  );
}
