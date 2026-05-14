import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Trophy,
  Loader2,
  RotateCw,
  TrendingUp,
  TrendingDown,
  Sparkles,
  Clock,
} from 'lucide-react';
import { insightsApi, type WinPattern } from '../lib/api.ts';

/**
 * Phase 5 — win-pattern analysis on the Stats page. On-demand: button
 * triggers an "Generate insights" run (cached 7 days on the backend).
 */
export default function WinPatternSection() {
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ['win-pattern'],
    queryFn: () => insightsApi.getWinPattern(),
    staleTime: 24 * 60 * 60 * 1000,
    retry: false,
  });

  const refresh = useMutation({
    mutationFn: () => insightsApi.refreshWinPattern(),
    onSuccess: (data) => qc.setQueryData(['win-pattern'], data),
  });

  const isRunning = q.isLoading || refresh.isPending;
  const data: WinPattern | undefined = q.data;

  return (
    <section className="mt-10 rounded-md border border-border bg-surface-1 p-5 sm:p-6">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-ink-3" strokeWidth={2} />
          <h2 className="font-display text-lg font-medium tracking-tight">
            Win patterns
          </h2>
          {data && (
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-4">
              {data.corpus_size} call{data.corpus_size === 1 ? '' : 's'}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => refresh.mutate()}
          disabled={isRunning}
          className="inline-flex h-9 items-center gap-1.5 rounded-sm border border-border bg-surface-1 px-3 text-xs font-medium text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isRunning ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
          ) : (
            <RotateCw className="h-3.5 w-3.5" strokeWidth={2} />
          )}
          {data ? 'Regenerate' : 'Generate'}
        </button>
      </header>

      {q.isError && (
        <p className="text-xs text-ink-3">
          Couldn't generate insights. Try again later.
        </p>
      )}

      {q.isLoading && (
        <p className="text-xs text-ink-3">Crunching the corpus…</p>
      )}

      {data && !data.enough_data && (
        <p className="text-sm leading-snug text-ink-2">
          {data.output.recommendations[0] ??
            'Need more analyzed calls before patterns are reliable.'}
        </p>
      )}

      {data && data.enough_data && (
        <div className="space-y-5">
          {data.output.duration_insight && (
            <Block icon={Clock} label="Duration">
              <p className="text-[14px] leading-snug text-ink wrap-break-word">
                {data.output.duration_insight}
              </p>
            </Block>
          )}

          {data.output.language_patterns.length > 0 && (
            <Block icon={Sparkles} label="Language patterns in wins">
              <ul className="space-y-1.5 text-[14px] leading-snug text-ink">
                {data.output.language_patterns.map((p, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="mt-2 inline-block h-1 w-1 shrink-0 rounded-full bg-ink-3" />
                    <span className="italic wrap-break-word">"{p}"</span>
                  </li>
                ))}
              </ul>
            </Block>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            {data.output.industries_strong.length > 0 && (
              <Block icon={TrendingUp} label="Industries you win">
                <ul className="space-y-1.5 text-[13px] leading-snug">
                  {data.output.industries_strong.map((row, i) => (
                    <li key={i} className="flex items-center justify-between gap-3">
                      <span className="text-ink wrap-break-word">{row.name}</span>
                      <span
                        className="font-mono text-[12px]"
                        style={{ color: 'var(--color-accent)' }}
                      >
                        {Math.round(row.win_rate * 100)}%
                      </span>
                    </li>
                  ))}
                </ul>
              </Block>
            )}
            {data.output.industries_weak.length > 0 && (
              <Block icon={TrendingDown} label="Industries you lose">
                <ul className="space-y-1.5 text-[13px] leading-snug">
                  {data.output.industries_weak.map((row, i) => (
                    <li key={i} className="flex items-center justify-between gap-3">
                      <span className="text-ink-2 wrap-break-word">{row.name}</span>
                      <span className="font-mono text-[12px] text-ink-3">
                        {Math.round(row.loss_rate * 100)}%
                      </span>
                    </li>
                  ))}
                </ul>
              </Block>
            )}
          </div>

          {data.output.recommendations.length > 0 && (
            <div
              className="rounded-sm border border-border/70 p-4"
              style={{
                background:
                  'color-mix(in oklab, var(--color-accent) 5%, var(--surface-2))',
              }}
            >
              <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.18em] text-ink-3">
                Recommendations
              </div>
              <ul className="space-y-1.5 text-[14px] leading-snug text-ink">
                {data.output.recommendations.map((r, i) => (
                  <li key={i} className="flex gap-2">
                    <span
                      className="mt-2 inline-block h-1 w-1 shrink-0 rounded-full"
                      style={{ background: 'var(--color-accent)' }}
                    />
                    <span className="wrap-break-word">{r}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function Block({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Trophy;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-ink-3">
        <Icon className="h-3 w-3" strokeWidth={2.25} />
        {label}
      </div>
      {children}
    </div>
  );
}
