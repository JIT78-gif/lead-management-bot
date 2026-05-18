import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  UserCog,
  Bot as BotIcon,
  Send,
  Loader2,
} from 'lucide-react';
import { conversationsApi, ApiError } from '../lib/api.ts';

/**
 * Self-contained chat takeover controls — drop into any page that knows
 * a phone number. Internally fetches the conversation state (5s poll),
 * renders the take-over / release toggle, the "you're replying as Botifys"
 * banner when paused, and a compose form for manual WhatsApp replies.
 *
 * Both /chats/:phone and /lead/:phone use the same underlying conversation
 * row, so taking over here also takes over there (and vice versa).
 *
 * The `onMessageSent` callback lets the host page invalidate any extra
 * queries it owns (e.g. lead-detail's `['lead', phone, 'messages']` query)
 * so the new message shows up in its own transcript without delay.
 */
export default function ChatTakeover({
  phone,
  onMessageSent,
}: {
  phone: string;
  onMessageSent?: () => void;
}) {
  const qc = useQueryClient();
  const [composeText, setComposeText] = useState('');
  const [sendError, setSendError] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ['conversation', phone],
    queryFn: () => conversationsApi.get(phone),
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
  });

  const takeover = useMutation({
    mutationFn: () => conversationsApi.takeover(phone),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['conversation', phone] }),
  });

  const release = useMutation({
    mutationFn: () => conversationsApi.release(phone),
    onSuccess: () => {
      setComposeText('');
      setSendError(null);
      qc.invalidateQueries({ queryKey: ['conversation', phone] });
    },
  });

  const sendMsg = useMutation({
    mutationFn: (text: string) => conversationsApi.sendMessage(phone, text),
    onSuccess: () => {
      setComposeText('');
      setSendError(null);
      qc.invalidateQueries({ queryKey: ['conversation', phone] });
      onMessageSent?.();
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

  function handleSend(e: FormEvent) {
    e.preventDefault();
    const text = composeText.trim();
    if (!text || sendMsg.isPending) return;
    sendMsg.mutate(text);
  }

  // While the conversation row hasn't loaded once yet, render a compact
  // skeleton so layout doesn't jump.
  if (q.isLoading || !q.data) {
    return (
      <div className="h-12 w-full animate-pulse rounded-sm bg-surface-2" />
    );
  }

  const paused = q.data.bot_paused;

  return (
    <div className="space-y-3">
      {/* Toggle + status row */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p
          className="text-[12px] leading-snug"
          style={{ color: paused ? 'var(--color-accent)' : 'var(--ink-3)' }}
        >
          {paused
            ? "You're replying as Botifys. Bot won't auto-reply until you release."
            : 'Bot is handling replies automatically. Take over to send a message yourself.'}
        </p>
        {paused ? (
          <button
            type="button"
            onClick={() => release.mutate()}
            disabled={release.isPending}
            className="inline-flex h-10 items-center gap-2 rounded-sm border border-border bg-surface-1 px-3 text-[13px] font-medium text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-60"
          >
            {release.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
            ) : (
              <BotIcon className="h-3.5 w-3.5" strokeWidth={2.25} />
            )}
            Release to bot
          </button>
        ) : (
          <button
            type="button"
            onClick={() => takeover.mutate()}
            disabled={takeover.isPending}
            className="inline-flex h-10 items-center gap-2 rounded-sm border border-border bg-surface-1 px-3 text-[13px] font-medium text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-60"
          >
            {takeover.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
            ) : (
              <UserCog className="h-3.5 w-3.5" strokeWidth={2.25} />
            )}
            Take over chat
          </button>
        )}
      </div>

      {/* Compose form — only when paused */}
      {paused && (
        <form
          onSubmit={handleSend}
          className="rounded-md border p-3 sm:p-4"
          style={{
            borderColor:
              'color-mix(in oklab, var(--color-accent) 30%, var(--border))',
            background:
              'color-mix(in oklab, var(--color-accent) 4%, var(--surface-1))',
          }}
        >
          <label
            htmlFor={`compose-${phone}`}
            className="mb-2 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.2em] text-ink-3"
          >
            <UserCog className="h-3 w-3" strokeWidth={2.25} />
            Send a message
          </label>
          <textarea
            id={`compose-${phone}`}
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
              Sent as Botifys · counts against the 24h window.
            </span>
            <button
              type="submit"
              disabled={!composeText.trim() || sendMsg.isPending}
              className="inline-flex h-10 items-center gap-2 rounded-sm px-4 text-sm font-medium text-paper transition-transform active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
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
      )}
    </div>
  );
}
