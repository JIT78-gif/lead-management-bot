import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  GraduationCap,
  Loader2,
  ThumbsUp,
  TrendingUp,
  Lightbulb,
  Target,
  RotateCw,
} from 'lucide-react';
import { insightsApi, type Coaching } from '../lib/api.ts';

/**
 * Phase 5 — private call coaching, shown inside the expanded call card.
 * Hidden when the call hasn't been analyzed yet (the API returns coaching=null).
 */
export default function CoachingCard({
  callId,
  enabled,
}: {
  callId: number;
  enabled: boolean;
}) {
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ['call-coaching', callId],
    queryFn: () => insightsApi.getCoaching(callId),
    enabled,
    staleTime: 60 * 60 * 1000,
    retry: false,
  });

  const refresh = useMutation({
    mutationFn: () => insightsApi.refreshCoaching(callId),
    onSuccess: (data) => {
      qc.setQueryData(['call-coaching', callId], data);
    },
  });

  if (!enabled) return null;

  if (q.isLoading) {
    return (
      <Wrapper>
        <div className="flex items-center gap-2 text-xs text-ink-3">
          <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
          Generating coaching…
        </div>
      </Wrapper>
    );
  }

  if (q.isError) {
    return (
      <Wrapper>
        <p className="text-xs text-ink-3">
          Couldn't load coaching.{' '}
          <button
            type="button"
            onClick={() => q.refetch()}
            className="underline hover:text-ink"
          >
            Retry
          </button>
        </p>
      </Wrapper>
    );
  }

  const coaching: Coaching | null = q.data?.coaching ?? null;
  if (!coaching) return null;

  return (
    <Wrapper>
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-ink-3">
          Private coaching
        </span>
        <button
          type="button"
          onClick={() => refresh.mutate()}
          disabled={refresh.isPending}
          className="inline-flex items-center gap-1 text-[11px] text-ink-3 transition-colors hover:text-ink disabled:opacity-50"
        >
          {refresh.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" strokeWidth={2} />
          ) : (
            <RotateCw className="h-3 w-3" strokeWidth={2} />
          )}
          Refresh
        </button>
      </div>

      {coaching.wins.length > 0 && (
        <Block
          icon={ThumbsUp}
          label="What you did well"
          tintVar="--coach-tint-win"
        >
          {coaching.wins.map((w, i) => (
            <Line key={i}>{w}</Line>
          ))}
        </Block>
      )}

      {coaching.improvements.length > 0 && (
        <Block
          icon={TrendingUp}
          label="Try next time"
          tintVar="--coach-tint-improve"
        >
          {coaching.improvements.map((w, i) => (
            <Line key={i}>{w}</Line>
          ))}
        </Block>
      )}

      {coaching.missed_opportunity && (
        <Block
          icon={Lightbulb}
          label="Biggest miss"
          tintVar="--coach-tint-miss"
        >
          <Line>{coaching.missed_opportunity}</Line>
        </Block>
      )}

      {coaching.next_call_focus && (
        <Block icon={Target} label="Focus next call" tintVar="--coach-tint-focus">
          <Line>{coaching.next_call_focus}</Line>
        </Block>
      )}
    </Wrapper>
  );
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <section
      className="mt-5 rounded-md border border-border p-4"
      style={{
        background:
          'color-mix(in oklab, var(--color-accent) 4%, var(--surface-2))',
        // Define the per-block tints once, in CSS variables, so each block
        // can swap by name without recomputing color-mix expressions.
        ['--coach-tint-win' as string]:
          'color-mix(in oklab, oklch(0.72 0.15 145) 18%, transparent)',
        ['--coach-tint-improve' as string]:
          'color-mix(in oklab, oklch(0.75 0.13 75) 18%, transparent)',
        ['--coach-tint-miss' as string]:
          'color-mix(in oklab, oklch(0.7 0.16 30) 16%, transparent)',
        ['--coach-tint-focus' as string]:
          'color-mix(in oklab, var(--color-accent) 14%, transparent)',
      } as React.CSSProperties}
    >
      <header className="mb-3 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.2em] text-ink-3">
        <GraduationCap className="h-3.5 w-3.5" strokeWidth={2.25} />
        AI coaching
      </header>
      {children}
    </section>
  );
}

function Block({
  icon: Icon,
  label,
  tintVar,
  children,
}: {
  icon: typeof GraduationCap;
  label: string;
  tintVar: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="mt-2.5 rounded-sm border border-border/60 p-3 first:mt-0"
      style={{ background: `var(${tintVar})` }}
    >
      <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-ink-2">
        <Icon className="h-3 w-3" strokeWidth={2.25} />
        {label}
      </div>
      <ul className="space-y-1 text-[13px] leading-snug text-ink">{children}</ul>
    </div>
  );
}

function Line({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <span className="mt-1.5 inline-block h-1 w-1 shrink-0 rounded-full bg-ink-3" />
      <span className="wrap-break-word">{children}</span>
    </li>
  );
}
