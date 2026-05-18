import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ExternalLink,
  Loader2,
  RotateCcw,
  Phone as PhoneIcon,
  AlertCircle,
  UserCog,
  Bot as BotIcon,
  Send,
  StickyNote,
  Check,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { conversationsApi, ApiError } from '../lib/api.ts';
import { formatPhone, timeAgo } from '../lib/format.ts';
import Conversation from '../components/conversation-bubble.tsx';
import ConvoStateBadge from '../components/convo-state-badge.tsx';
import StallBadge from '../components/stall-badge.tsx';

export default function ConversationDetailRoute() {
  const { phone = '' } = useParams<{ phone: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [confirmReset, setConfirmReset] = useState(false);
  const [composeText, setComposeText] = useState('');
  const [sendError, setSendError] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState('');
  const [notesHydrated, setNotesHydrated] = useState(false);
  const [notesSavedAt, setNotesSavedAt] = useState<number | null>(null);

  const q = useQuery({
    queryKey: ['conversation', phone],
    queryFn: () => conversationsApi.get(phone),
    enabled: !!phone,
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
  });

  // Hydrate the notes draft once when the conversation loads. We don't want
  // every poll-refetch to clobber whatever the salesperson is typing.
  useEffect(() => {
    if (q.data && !notesHydrated) {
      setNotesDraft(q.data.notes ?? '');
      setNotesHydrated(true);
    }
  }, [q.data, notesHydrated]);

  const reset = useMutation({
    mutationFn: () => conversationsApi.reset(phone),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['conversations'] });
      qc.invalidateQueries({ queryKey: ['conversation', phone] });
      navigate('/chats', { replace: true });
    },
  });

  const takeover = useMutation({
    mutationFn: () => conversationsApi.takeover(phone),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['conversation', phone] });
      qc.invalidateQueries({ queryKey: ['conversations'] });
    },
  });

  const release = useMutation({
    mutationFn: () => conversationsApi.release(phone),
    onSuccess: () => {
      setComposeText('');
      setSendError(null);
      qc.invalidateQueries({ queryKey: ['conversation', phone] });
      qc.invalidateQueries({ queryKey: ['conversations'] });
    },
  });

  const sendMsg = useMutation({
    mutationFn: (text: string) => conversationsApi.sendMessage(phone, text),
    onSuccess: () => {
      setComposeText('');
      setSendError(null);
      // Refetch immediately so the sent message appears in the transcript
      // without waiting for the 5s poll.
      qc.invalidateQueries({ queryKey: ['conversation', phone] });
    },
    onError: (err) => {
      const msg =
        err instanceof ApiError
          ? (err.payload as { message?: string })?.message ?? err.message
          : err instanceof Error
            ? err.message
            : 'Send failed';
      setSendError(msg);
    },
  });

  const saveNotes = useMutation({
    mutationFn: (notes: string) =>
      conversationsApi.updateNotes(phone, notes.trim() === '' ? null : notes),
    onSuccess: () => {
      setNotesSavedAt(Date.now());
      qc.invalidateQueries({ queryKey: ['conversation', phone] });
    },
  });

  const qualify = useMutation({
    mutationFn: () => conversationsApi.qualify(phone),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['conversation', phone] });
      qc.invalidateQueries({ queryKey: ['conversations'] });
      qc.invalidateQueries({ queryKey: ['leads'] });
    },
  });

  const disqualify = useMutation({
    mutationFn: () => conversationsApi.disqualify(phone),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['conversation', phone] });
      qc.invalidateQueries({ queryKey: ['conversations'] });
    },
  });

  function handleSend(e: FormEvent) {
    e.preventDefault();
    const text = composeText.trim();
    if (!text || sendMsg.isPending) return;
    sendMsg.mutate(text);
  }

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

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {c.bot_paused ? (
              <button
                type="button"
                onClick={() => release.mutate()}
                disabled={release.isPending}
                className="inline-flex h-11 items-center gap-2 rounded-sm border border-border bg-surface-1 px-3.5 text-sm font-medium text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-60 sm:h-10"
              >
                {release.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
                ) : (
                  <BotIcon className="h-4 w-4" strokeWidth={2.25} />
                )}
                Release to bot
              </button>
            ) : (
              <button
                type="button"
                onClick={() => takeover.mutate()}
                disabled={takeover.isPending}
                className="inline-flex h-11 items-center gap-2 rounded-sm border border-border bg-surface-1 px-3.5 text-sm font-medium text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-60 sm:h-10"
              >
                {takeover.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
                ) : (
                  <UserCog className="h-4 w-4" strokeWidth={2.25} />
                )}
                Take over chat
              </button>
            )}
            <a
              href={`tel:+${c.phone}`}
              className="inline-flex h-11 items-center gap-2 rounded-sm bg-ink px-4 text-sm font-medium text-paper transition-transform active:scale-[0.99] sm:h-10"
            >
              <PhoneIcon className="h-4 w-4" strokeWidth={2.25} />
              Call
            </a>
          </div>
        </div>

        {c.bot_paused ? (
          <p
            className="mt-4 rounded-sm border px-3 py-2 text-[12px]"
            style={{
              background:
                'color-mix(in oklab, var(--color-accent) 8%, var(--surface-1))',
              borderColor:
                'color-mix(in oklab, var(--color-accent) 35%, transparent)',
              color: 'var(--ink)',
            }}
          >
            <strong>You're replying as Botifys.</strong> The bot is paused for
            this conversation — any incoming messages will appear here but
            the bot won't auto-reply until you release it.
          </p>
        ) : (
          c.is_waiting_on_bot && (
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
          )
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

      {/* ── Compose (manual reply, only when bot is paused) ── */}
      {c.bot_paused && (
        <section className="mt-6">
          <form
            onSubmit={handleSend}
            className="rounded-md border border-border bg-surface-1 p-3 sm:p-4"
            style={{
              borderColor:
                'color-mix(in oklab, var(--color-accent) 30%, var(--border))',
            }}
          >
            <label
              htmlFor="compose"
              className="mb-2 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.2em] text-ink-3"
            >
              <UserCog className="h-3 w-3" strokeWidth={2.25} />
              Send a message
            </label>
            <textarea
              id="compose"
              value={composeText}
              onChange={(e) => {
                setComposeText(e.target.value);
                if (sendError) setSendError(null);
              }}
              placeholder="Type a reply to send via WhatsApp…"
              rows={3}
              disabled={sendMsg.isPending}
              className="block w-full resize-y rounded-sm border border-border bg-paper px-3 py-2 text-[14px] leading-snug text-ink placeholder:text-ink-4 focus:border-ink-3 focus:outline-none disabled:opacity-60"
            />
            {sendError && (
              <p
                className="mt-2 text-[12px]"
                style={{ color: 'var(--color-accent)' }}
                role="alert"
              >
                {sendError}
              </p>
            )}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] text-ink-4">
                Sent as Botifys via WhatsApp · counts against the 24h window.
              </span>
              <button
                type="submit"
                disabled={!composeText.trim() || sendMsg.isPending}
                className="inline-flex h-11 items-center gap-2 rounded-sm px-4 text-sm font-medium text-paper transition-transform active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 sm:h-10"
                style={{ background: 'var(--color-accent)' }}
              >
                {sendMsg.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
                ) : (
                  <Send className="h-4 w-4" strokeWidth={2.25} />
                )}
                Send
              </button>
            </div>
          </form>
        </section>
      )}

      {/* ── Notes (per-conversation, all states) ── */}
      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.2em] text-ink-3">
            <StickyNote className="h-3 w-3" strokeWidth={2.25} />
            Notes
          </h2>
          {notesSavedAt && notesDraft === (c.notes ?? '') && (
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.18em] text-ink-4">
              <Check className="h-3 w-3" strokeWidth={2.5} />
              Saved {timeAgo(notesSavedAt)}
            </span>
          )}
        </div>
        <textarea
          value={notesDraft}
          onChange={(e) => setNotesDraft(e.target.value)}
          placeholder="Called at 3pm, no answer. Try again Wed morning. Wife runs operations, ask for her."
          rows={4}
          className="block w-full resize-y rounded-sm border border-border bg-surface-1 px-3 py-2.5 text-[14px] leading-snug text-ink placeholder:text-ink-4 focus:border-ink-3 focus:outline-none"
        />
        <div className="mt-2 flex items-center justify-end gap-2">
          {notesDraft !== (c.notes ?? '') && (
            <button
              type="button"
              onClick={() => saveNotes.mutate(notesDraft)}
              disabled={saveNotes.isPending}
              className="inline-flex h-10 items-center gap-2 rounded-sm bg-ink px-4 text-sm font-medium text-paper disabled:opacity-60"
            >
              {saveNotes.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
              ) : (
                <Check className="h-3.5 w-3.5" strokeWidth={2.25} />
              )}
              Save note
            </button>
          )}
        </div>
      </section>

      {/* ── Mark outcome after a manual phone call ── */}
      <section className="mt-8 rounded-md border border-border bg-surface-1 p-4 sm:p-5">
        <div className="mb-3">
          <h3 className="text-sm font-medium text-ink">Mark this conversation</h3>
          <p className="mt-1 text-[12px] leading-snug text-ink-3">
            After you've called them, set the outcome by hand. Qualifying
            adds them to your Leads list. Disqualifying hides them from the
            active workflow.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => qualify.mutate()}
            disabled={qualify.isPending || c.state === 'qualified'}
            className="inline-flex h-11 items-center gap-2 rounded-sm px-4 text-sm font-medium text-paper transition-transform active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 sm:h-10"
            style={{
              background:
                c.state === 'qualified'
                  ? 'color-mix(in oklab, oklch(0.72 0.15 145) 70%, var(--surface-2))'
                  : 'oklch(0.55 0.16 145)',
            }}
          >
            {qualify.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
            ) : (
              <CheckCircle2 className="h-4 w-4" strokeWidth={2.25} />
            )}
            {c.state === 'qualified' ? 'Already qualified' : 'Mark as qualified'}
          </button>

          <button
            type="button"
            onClick={() => disqualify.mutate()}
            disabled={disqualify.isPending || c.state === 'disqualified'}
            className="inline-flex h-11 items-center gap-2 rounded-sm border border-border bg-surface-1 px-4 text-sm font-medium text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 sm:h-10"
          >
            {disqualify.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
            ) : (
              <XCircle className="h-4 w-4" strokeWidth={2.25} />
            )}
            {c.state === 'disqualified' ? 'Already disqualified' : 'Mark as disqualified'}
          </button>

          {c.lead_status && (
            <Link
              to={`/lead/${c.phone}`}
              className="ml-auto inline-flex h-10 items-center gap-1 rounded-sm border border-border bg-surface-1 px-3 text-[12px] font-medium text-ink-2 hover:bg-surface-2 hover:text-ink"
            >
              Edit lead details
              <ExternalLink className="h-3 w-3" strokeWidth={2.25} />
            </Link>
          )}
        </div>
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
