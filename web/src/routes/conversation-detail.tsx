import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ExternalLink,
  Loader2,
  RotateCcw,
  Phone as PhoneIcon,
  AlertCircle,
} from 'lucide-react';
import { conversationsApi } from '../lib/api.ts';
import { formatPhone, timeAgo } from '../lib/format.ts';
import Conversation from '../components/conversation-bubble.tsx';
import ConvoStateBadge from '../components/convo-state-badge.tsx';
import StallBadge from '../components/stall-badge.tsx';

export default function ConversationDetailRoute() {
  const { phone = '' } = useParams<{ phone: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [confirmReset, setConfirmReset] = useState(false);

  const q = useQuery({
    queryKey: ['conversation', phone],
    queryFn: () => conversationsApi.get(phone),
    enabled: !!phone,
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
  });

  const reset = useMutation({
    mutationFn: () => conversationsApi.reset(phone),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['conversations'] });
      qc.invalidateQueries({ queryKey: ['conversation', phone] });
      navigate('/chats', { replace: true });
    },
  });

  if (q.isLoading) {
    return <DetailSkeleton />;
  }

  if (q.isError || !q.data) {
    return (
      <div className="grid place-items-center rounded-md border border-dashed border-border bg-surface-1 px-6 py-16 text-center">
        <AlertCircle className="mb-3 h-6 w-6 text-ink-4" strokeWidth={1.5} />
        <p className="text-sm text-ink-3">Conversation not found.</p>
        <Link
          to="/chats"
          className="mt-6 inline-flex items-center gap-2 rounded-sm bg-ink px-4 py-2 text-sm font-medium text-paper"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={2.25} />
          Back to chats
        </Link>
      </div>
    );
  }

  const c = q.data;
  const displayName = c.whatsapp_name?.trim() || formatPhone(c.phone);
  const startedAgo = timeAgo(c.created_at);
  const messageCount = c.messages.length;

  return (
    <div className="fade-in pb-16">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="-ml-2 inline-flex h-11 items-center gap-1.5 rounded-sm px-3 text-sm text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink sm:h-9 sm:px-2"
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={2.25} />
        Back to chats
      </button>

      {/* ── Identity card ── */}
      <section className="mt-4 rounded-md border border-border bg-surface-1 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-3xl font-medium leading-tight tracking-tight wrap-break-word sm:text-4xl">
              {displayName}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-ink-3">
              <span className="font-mono">{formatPhone(c.phone)}</span>
              <span className="text-ink-4">·</span>
              <span>Started {startedAgo}</span>
              <span className="text-ink-4">·</span>
              <span>
                {messageCount} message{messageCount === 1 ? '' : 's'}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <ConvoStateBadge state={c.state} size="md" />
              {c.is_stalled && <StallBadge size="md" />}
              {c.lead_status && (
                <Link
                  to={`/lead/${c.phone}`}
                  className="inline-flex items-center gap-1 rounded-xs border border-border bg-surface-2 px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.14em] text-ink-2 transition-colors hover:bg-surface-1"
                >
                  Open lead
                  <ExternalLink className="h-2.5 w-2.5" strokeWidth={2.5} />
                </Link>
              )}
            </div>
          </div>

          <a
            href={`tel:+${c.phone}`}
            className="inline-flex h-11 shrink-0 items-center gap-2 rounded-sm bg-ink px-4 text-sm font-medium text-paper transition-transform active:scale-[0.99] sm:h-10"
          >
            <PhoneIcon className="h-4 w-4" strokeWidth={2.25} />
            Call
          </a>
        </div>

        {c.is_waiting_on_bot && (
          <p
            className="mt-4 rounded-sm border px-3 py-2 text-[12px]"
            style={{
              background:
                'color-mix(in oklab, var(--color-accent) 7%, var(--surface-1))',
              borderColor:
                'color-mix(in oklab, var(--color-accent) 30%, transparent)',
              color: 'var(--ink-2)',
            }}
          >
            Customer is waiting on a reply from the bot.
          </p>
        )}
      </section>

      {/* ── Live transcript ── */}
      <section className="mt-6">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-[10px] font-medium uppercase tracking-[0.2em] text-ink-3">
            Live transcript · refreshing every 5s
          </h2>
          <span className="text-[10px] uppercase tracking-[0.18em] text-ink-4">
            Updated {timeAgo(q.dataUpdatedAt || Date.now())}
          </span>
        </div>
        <Conversation messages={c.messages} showDeliveryStatus />
      </section>

      {/* ── Reset (recover from false-disqualify) ── */}
      <section className="mt-10">
        <div className="rounded-md border border-dashed border-border bg-surface-1 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-medium text-ink">Reset conversation</h3>
              <p className="mt-1 text-[12px] leading-snug text-ink-3">
                Wipes the messages, lead record, and bot state for this number.
                The next message from them will start the qualifying flow from
                scratch. Use this when the bot wrongly disqualified a real
                business owner.
              </p>
            </div>
            {confirmReset ? (
              <div className="flex shrink-0 items-center gap-2">
                <span className="text-xs text-ink-3">Sure?</span>
                <button
                  type="button"
                  onClick={() => setConfirmReset(false)}
                  className="inline-flex h-10 items-center rounded-sm border border-border bg-surface-1 px-3 text-sm text-ink-2 hover:bg-surface-2"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => reset.mutate()}
                  disabled={reset.isPending}
                  className="inline-flex h-10 items-center gap-2 rounded-sm px-3 text-sm font-medium text-paper disabled:opacity-60"
                  style={{ background: 'var(--color-accent)' }}
                >
                  {reset.isPending && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
                  )}
                  Reset
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmReset(true)}
                className="inline-flex h-10 shrink-0 items-center gap-2 rounded-sm border border-border bg-surface-1 px-3 text-sm font-medium text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
              >
                <RotateCcw className="h-3.5 w-3.5" strokeWidth={2} />
                Reset
              </button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="fade-in space-y-6">
      <div className="h-8 w-32 animate-pulse rounded-xs bg-surface-2" />
      <div className="h-32 animate-pulse rounded-md bg-surface-2" />
      <div className="h-64 animate-pulse rounded-md bg-surface-2" />
    </div>
  );
}
