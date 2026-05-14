import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Mic,
  Loader2,
  AlertCircle,
  ChevronDown,
  Trash2,
  RotateCw,
  AlertTriangle,
  Sparkles,
  ListChecks,
  CircleHelp,
} from 'lucide-react';
import { callsApi, parseJsonArray, type Call } from '../lib/api.ts';
import { timeAgo } from '../lib/format.ts';
import VerdictBadge from './verdict-badge.tsx';
import AudioPlayer from './audio-player.tsx';
import CoachingCard from './coaching-card.tsx';

function formatDuration(s: number | null): string {
  if (!s || s < 1) return '—';
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m}m ${r}s` : `${r}s`;
}

function formatExactDate(ts: number): string {
  return new Date(ts).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export default function CallCard({ call }: { call: Call }) {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const summary = parseJsonArray(call.summary);
  const keyPoints = parseJsonArray(call.key_points);
  const objections = parseJsonArray(call.objections);
  const actionItems = parseJsonArray(call.action_items);

  const reanalyze = useMutation({
    mutationFn: () => callsApi.reanalyze(call.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lead-calls', call.phone] });
    },
  });

  const deleteCall = useMutation({
    mutationFn: () => callsApi.delete(call.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lead-calls', call.phone] });
    },
  });

  const isHot = call.verdict === 'hot';

  return (
    <article
      className="relative overflow-hidden rounded-md border border-border bg-surface-1 transition-colors"
      style={
        isHot
          ? {
              borderColor:
                'color-mix(in oklab, var(--color-accent) 35%, var(--border))',
            }
          : undefined
      }
    >
      {/* Hot leads get an accent stripe */}
      {isHot && (
        <div
          aria-hidden
          className="absolute inset-y-0 left-0 w-px"
          style={{ background: 'var(--color-accent)' }}
        />
      )}

      {/* ── Header: always visible, click to expand ── */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-start gap-3 p-4 text-left sm:p-5"
        aria-expanded={expanded}
      >
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface-2 text-ink-3 sm:h-9 sm:w-9">
          <Mic className="h-3.5 w-3.5 sm:h-4 sm:w-4" strokeWidth={2.25} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-sm font-medium text-ink">
              {timeAgo(call.created_at)}
            </span>
            <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-4">
              {formatDuration(call.duration_seconds)}
            </span>
            <span className="ml-auto flex items-center gap-2">
              {call.status === 'processing' && (
                <span className="inline-flex items-center gap-1.5 text-xs text-ink-3">
                  <Loader2 className="h-3 w-3 animate-spin" strokeWidth={2} />
                  Analysing…
                </span>
              )}
              {call.status === 'failed' && (
                <span
                  className="inline-flex items-center gap-1.5 text-xs"
                  style={{ color: 'var(--color-accent)' }}
                >
                  <AlertCircle className="h-3 w-3" strokeWidth={2} />
                  Failed
                </span>
              )}
              {call.status === 'analyzed' && call.verdict && (
                <VerdictBadge
                  verdict={call.verdict}
                  confidence={call.verdict_confidence}
                  size="sm"
                />
              )}
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-ink-4 transition-transform ${expanded ? 'rotate-180' : ''}`}
                strokeWidth={2}
              />
            </span>
          </div>

          {/* Collapsed summary preview */}
          {!expanded && call.status === 'analyzed' && summary.length > 0 && (
            <ul className="mt-2.5 space-y-1.5 text-[13px] leading-snug text-ink-2">
              {summary.slice(0, 2).map((bullet, i) => (
                <li key={i} className="flex gap-2">
                  <span className="mt-1.5 inline-block h-1 w-1 shrink-0 rounded-full bg-ink-4" />
                  <span className="wrap-break-word">{bullet}</span>
                </li>
              ))}
              {summary.length > 2 && (
                <li className="text-[12px] text-ink-4">
                  +{summary.length - 2} more · tap to expand
                </li>
              )}
            </ul>
          )}

          {!expanded && call.status === 'failed' && call.error && (
            <p className="mt-2 font-mono text-[11px] text-ink-3 wrap-break-word">
              {call.error}
            </p>
          )}
        </div>
      </button>

      {/* ── Expanded content ── */}
      {expanded && (
        <div className="border-t border-border px-4 py-4 sm:px-5 sm:py-5">
          {/* Audio player */}
          <div className="mb-5">
            <AudioPlayer callId={call.id} />
            <div className="mt-1.5 text-[11px] uppercase tracking-[0.16em] text-ink-4">
              {formatExactDate(call.created_at)}
            </div>
          </div>

          {/* Verdict reasoning */}
          {call.status === 'analyzed' && call.verdict_reasoning && (
            <p className="mb-5 text-[13px] italic leading-snug text-ink-2">
              "{call.verdict_reasoning}"
            </p>
          )}

          {/* Summary */}
          {call.status === 'analyzed' && summary.length > 0 && (
            <SectionBlock label="Summary" icon={Sparkles}>
              <ul className="space-y-1.5 text-[14px] leading-snug text-ink">
                {summary.map((bullet, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="mt-2 inline-block h-1 w-1 shrink-0 rounded-full bg-ink-3" />
                    <span className="wrap-break-word">{bullet}</span>
                  </li>
                ))}
              </ul>
            </SectionBlock>
          )}

          {/* Key points */}
          {keyPoints.length > 0 && (
            <SectionBlock label="Key points" icon={ListChecks}>
              <ul className="space-y-1.5 text-[14px] leading-snug text-ink-2">
                {keyPoints.map((pt, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="mt-2 inline-block h-1 w-1 shrink-0 rounded-full bg-ink-4" />
                    <span className="wrap-break-word">{pt}</span>
                  </li>
                ))}
              </ul>
            </SectionBlock>
          )}

          {/* Objections */}
          {objections.length > 0 && (
            <SectionBlock label="Objections" icon={CircleHelp}>
              <ul className="space-y-1.5 text-[14px] leading-snug text-ink-2">
                {objections.map((o, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="mt-2 inline-block h-1 w-1 shrink-0 rounded-full bg-ink-4" />
                    <span className="wrap-break-word">{o}</span>
                  </li>
                ))}
              </ul>
            </SectionBlock>
          )}

          {/* Action items */}
          {actionItems.length > 0 && (
            <SectionBlock label="Next steps" icon={ListChecks}>
              <ul className="space-y-1.5 text-[14px] leading-snug text-ink">
                {actionItems.map((a, i) => (
                  <li key={i} className="flex gap-2">
                    <span
                      className="mt-2 inline-block h-1 w-1 shrink-0 rounded-full"
                      style={{ background: 'var(--color-accent)' }}
                    />
                    <span className="wrap-break-word">{a}</span>
                  </li>
                ))}
              </ul>
            </SectionBlock>
          )}

          {/* Transcript */}
          {call.status === 'analyzed' && call.transcript && (
            <SectionBlock label="Transcript" icon={Mic}>
              <pre className="max-h-72 overflow-y-auto rounded-sm border border-border bg-surface-2 p-3 font-sans text-[13px] leading-relaxed text-ink-2 whitespace-pre-wrap wrap-break-word">
                {call.transcript}
              </pre>
            </SectionBlock>
          )}

          {/* Failed-call error detail */}
          {call.status === 'failed' && call.error && (
            <SectionBlock label="What went wrong" icon={AlertTriangle}>
              <pre className="rounded-sm border border-border bg-surface-2 p-3 font-mono text-[12px] leading-relaxed text-ink-2 wrap-break-word whitespace-pre-wrap">
                {call.error}
              </pre>
            </SectionBlock>
          )}

          {/* Private AI coaching — Phase 5 */}
          <CoachingCard callId={call.id} enabled={call.status === 'analyzed'} />

          {/* Actions row */}
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => reanalyze.mutate()}
              disabled={reanalyze.isPending || call.status === 'processing'}
              className="inline-flex h-11 items-center sm:h-10 gap-2 rounded-sm border border-border bg-surface-1 px-3.5 text-sm font-medium text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
            >
              {reanalyze.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
              ) : (
                <RotateCw className="h-3.5 w-3.5" strokeWidth={2} />
              )}
              {reanalyze.isPending ? 'Restarting…' : 'Re-analyze'}
            </button>

            <div className="ml-auto">
              {confirmDelete ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-ink-3">Sure?</span>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="inline-flex h-11 items-center sm:h-10 rounded-sm border border-border bg-surface-1 px-3 text-sm text-ink-2 hover:bg-surface-2"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteCall.mutate()}
                    disabled={deleteCall.isPending}
                    className="inline-flex h-11 items-center sm:h-10 gap-2 rounded-sm px-3 text-sm font-medium text-paper disabled:opacity-60"
                    style={{ background: 'var(--color-accent)' }}
                  >
                    {deleteCall.isPending && (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
                    )}
                    Delete
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="inline-flex h-11 items-center sm:h-10 gap-2 rounded-sm border border-border bg-surface-1 px-3.5 text-sm font-medium text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
                >
                  <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                  Delete
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </article>
  );
}

function SectionBlock({
  label,
  icon: Icon,
  children,
}: {
  label: string;
  icon: typeof Mic;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-5 first:mt-0">
      <h4 className="mb-2 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.2em] text-ink-3">
        <Icon className="h-3 w-3" strokeWidth={2.25} />
        {label}
      </h4>
      {children}
    </section>
  );
}
