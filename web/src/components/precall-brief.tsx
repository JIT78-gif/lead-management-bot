import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Sparkles,
  Loader2,
  RotateCw,
  Quote,
  ShieldAlert,
  Ban,
} from 'lucide-react';
import { insightsApi, type PrecallBrief } from '../lib/api.ts';

/**
 * Phase 5 — 30-second pre-call brief banner, mounted at the top of Lead Detail.
 * Cached for 1h on the backend, so subsequent opens are instant. Refresh
 * link forces regeneration.
 */
export default function PrecallBriefBanner({ phone }: { phone: string }) {
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ['precall-brief', phone],
    queryFn: () => insightsApi.getPrecallBrief(phone),
    staleTime: 60 * 60 * 1000,
    retry: false,
  });

  const refresh = useMutation({
    mutationFn: () => insightsApi.refreshPrecallBrief(phone),
    onSuccess: (data) => qc.setQueryData(['precall-brief', phone], data),
  });

  if (q.isLoading) {
    return (
      <Wrapper>
        <div className="flex items-center gap-2 text-xs text-ink-3">
          <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
          Preparing brief…
        </div>
      </Wrapper>
    );
  }

  if (q.isError) {
    return (
      <Wrapper>
        <p className="text-xs text-ink-3">
          Couldn't generate the brief.{' '}
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

  const brief: PrecallBrief | null = q.data?.brief ?? null;
  if (!brief) return null;

  return (
    <Wrapper>
      <div className="flex flex-wrap items-start gap-3">
        <p className="flex-1 min-w-0 font-display text-[17px] leading-snug text-ink wrap-break-word sm:text-lg">
          {brief.headline}
        </p>
        <button
          type="button"
          onClick={() => refresh.mutate()}
          disabled={refresh.isPending}
          className="inline-flex shrink-0 items-center gap-1 text-[11px] text-ink-3 transition-colors hover:text-ink disabled:opacity-50"
          aria-label="Regenerate brief"
        >
          {refresh.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" strokeWidth={2} />
          ) : (
            <RotateCw className="h-3 w-3" strokeWidth={2} />
          )}
          Refresh
        </button>
      </div>

      {brief.signals.length > 0 && (
        <div className="mt-3">
          <Label>Signals</Label>
          <ul className="mt-1 space-y-1 text-[13px] leading-snug text-ink-2">
            {brief.signals.map((s, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-1.5 inline-block h-1 w-1 shrink-0 rounded-full bg-ink-4" />
                <span className="wrap-break-word">{s}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {brief.objections_expected.length > 0 && (
        <div className="mt-3">
          <Label icon={ShieldAlert}>Objections likely</Label>
          <ul className="mt-1 space-y-1 text-[13px] leading-snug text-ink-2">
            {brief.objections_expected.map((o, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-1.5 inline-block h-1 w-1 shrink-0 rounded-full bg-ink-4" />
                <span className="wrap-break-word">{o}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {brief.opening_line && (
        <div
          className="mt-3 rounded-sm border border-border/70 p-3"
          style={{
            background:
              'color-mix(in oklab, var(--color-accent) 6%, var(--surface-1))',
          }}
        >
          <div className="mb-1 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-ink-3">
            <Quote className="h-3 w-3" strokeWidth={2.25} />
            Suggested opening
          </div>
          <p className="text-[14px] italic leading-snug text-ink wrap-break-word">
            "{brief.opening_line}"
          </p>
        </div>
      )}

      {brief.do_not_say.length > 0 && (
        <div className="mt-3">
          <Label icon={Ban}>Don't say</Label>
          <ul className="mt-1 space-y-1 text-[13px] leading-snug text-ink-2">
            {brief.do_not_say.map((s, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-1.5 inline-block h-1 w-1 shrink-0 rounded-full bg-ink-4" />
                <span className="wrap-break-word">{s}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Wrapper>
  );
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <section
      className="mb-6 rounded-md border border-border p-4 sm:p-5"
      style={{
        background:
          'color-mix(in oklab, var(--color-accent) 4%, var(--surface-1))',
      }}
    >
      <header className="mb-3 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.2em] text-ink-3">
        <Sparkles className="h-3.5 w-3.5" strokeWidth={2.25} />
        Pre-call brief
      </header>
      {children}
    </section>
  );
}

function Label({
  icon: Icon,
  children,
}: {
  icon?: typeof Sparkles;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-ink-3">
      {Icon && <Icon className="h-3 w-3" strokeWidth={2.25} />}
      {children}
    </div>
  );
}
