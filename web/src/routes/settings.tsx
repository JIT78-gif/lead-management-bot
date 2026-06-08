import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Calendar,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertCircle,
  Link2,
  Unlink,
} from 'lucide-react';
import { googleApi } from '../lib/api.ts';

const CALLBACK_MESSAGES: Record<string, { kind: 'ok' | 'err'; text: string }> = {
  connected: { kind: 'ok', text: 'Google Calendar connected.' },
  denied: { kind: 'err', text: 'You declined the Google permission request.' },
  missing_code: { kind: 'err', text: 'Google did not return an authorization code. Try again.' },
  state_mismatch: { kind: 'err', text: 'Session expired during the OAuth dance. Try connecting again.' },
  exchange_failed: { kind: 'err', text: 'Google rejected the authorization. Try again.' },
};

export default function SettingsRoute() {
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [callbackFlash, setCallbackFlash] = useState<{ kind: 'ok' | 'err'; text: string } | null>(
    null
  );

  // Clear the ?google= query param after surfacing the message once.
  useEffect(() => {
    const flag = params.get('google');
    if (!flag) return;
    setCallbackFlash(CALLBACK_MESSAGES[flag] ?? { kind: 'err', text: `Unknown result: ${flag}` });
    const next = new URLSearchParams(params);
    next.delete('google');
    setParams(next, { replace: true });
  }, [params, setParams]);

  const statusQ = useQuery({
    queryKey: ['google-status'],
    queryFn: () => googleApi.status(),
    refetchInterval: 30_000,
  });

  const startConnect = useMutation({
    mutationFn: () => googleApi.startConnect(),
    onSuccess: ({ url }) => {
      window.location.assign(url);
    },
  });

  const doDisconnect = useMutation({
    mutationFn: () => googleApi.disconnect(),
    onSuccess: () => {
      setConfirmDisconnect(false);
      setCallbackFlash({ kind: 'ok', text: 'Google Calendar disconnected.' });
      qc.invalidateQueries({ queryKey: ['google-status'] });
    },
  });

  const status = statusQ.data;

  return (
    <div className="fade-in pb-12">
      <header className="mb-10">
        <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-ink-3">
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ background: 'var(--color-accent)' }}
          />
          Owner settings
        </div>
        <h1 className="font-display text-4xl font-medium tracking-tight sm:text-5xl">
          Settings.
        </h1>
      </header>

      {callbackFlash && (
        <div
          className="mb-6 flex items-start gap-3 rounded-md border p-4"
          style={{
            background:
              callbackFlash.kind === 'ok'
                ? 'color-mix(in oklab, oklch(0.72 0.15 145) 10%, var(--surface-1))'
                : 'color-mix(in oklab, var(--color-accent) 8%, var(--surface-1))',
            borderColor:
              callbackFlash.kind === 'ok'
                ? 'color-mix(in oklab, oklch(0.72 0.15 145) 30%, transparent)'
                : 'color-mix(in oklab, var(--color-accent) 30%, transparent)',
          }}
        >
          {callbackFlash.kind === 'ok' ? (
            <CheckCircle2
              className="h-4 w-4 shrink-0"
              strokeWidth={2}
              style={{ color: 'oklch(0.55 0.16 145)' }}
            />
          ) : (
            <AlertCircle
              className="h-4 w-4 shrink-0"
              strokeWidth={2}
              style={{ color: 'var(--color-accent)' }}
            />
          )}
          <span className="text-sm leading-snug text-ink">
            {callbackFlash.text}
          </span>
        </div>
      )}

      {/* ── Google Calendar section ── */}
      <section className="rounded-md border border-border bg-surface-1 p-5 sm:p-6">
        <div className="mb-4 flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface-2 text-ink-2">
            <Calendar className="h-4 w-4" strokeWidth={2.25} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-lg font-medium tracking-tight">
              Google Calendar
            </h2>
            <p className="mt-1 text-sm text-ink-3">
              Connect your Google account so the bot can auto-book 30-min Google Meets
              for international leads on your calendar.
            </p>
          </div>
        </div>

        <div className="mt-5">
          {statusQ.isLoading ? (
            <p className="text-sm text-ink-3">Checking status…</p>
          ) : !status?.configured ? (
            <NotConfigured />
          ) : status.connected ? (
            <Connected
              email={status.email!}
              connectedAt={status.connectedAt!}
              confirming={confirmDisconnect}
              onAskDisconnect={() => setConfirmDisconnect(true)}
              onCancel={() => setConfirmDisconnect(false)}
              onDisconnect={() => doDisconnect.mutate()}
              disconnecting={doDisconnect.isPending}
            />
          ) : (
            <Disconnected
              onConnect={() => startConnect.mutate()}
              connecting={startConnect.isPending}
            />
          )}
        </div>
      </section>
    </div>
  );
}

function NotConfigured() {
  return (
    <div className="rounded-sm border border-dashed border-border bg-surface-2 p-4 text-sm leading-snug text-ink-2">
      <p className="font-medium text-ink">Not configured on the server yet.</p>
      <p className="mt-1 text-ink-3">
        Set <code className="font-mono text-[12px] text-ink">GOOGLE_OAUTH_CLIENT_ID</code> and{' '}
        <code className="font-mono text-[12px] text-ink">GOOGLE_OAUTH_CLIENT_SECRET</code> in
        Easypanel and redeploy. Then come back here to connect.
      </p>
    </div>
  );
}

function Disconnected({
  onConnect,
  connecting,
}: {
  onConnect: () => void;
  connecting: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-sm text-ink-3">
        <XCircle className="h-4 w-4" strokeWidth={2} />
        Not connected
      </div>
      <button
        type="button"
        onClick={onConnect}
        disabled={connecting}
        className="inline-flex h-11 items-center gap-2 rounded-sm bg-ink px-4 text-sm font-medium text-paper transition-transform active:scale-[0.99] disabled:opacity-60 sm:h-10"
      >
        {connecting ? (
          <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
        ) : (
          <Link2 className="h-4 w-4" strokeWidth={2.25} />
        )}
        Connect Google Calendar
      </button>
    </div>
  );
}

function Connected({
  email,
  connectedAt,
  confirming,
  onAskDisconnect,
  onCancel,
  onDisconnect,
  disconnecting,
}: {
  email: string;
  connectedAt: number;
  confirming: boolean;
  onAskDisconnect: () => void;
  onCancel: () => void;
  onDisconnect: () => void;
  disconnecting: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-sm font-medium text-ink">
            <CheckCircle2
              className="h-4 w-4"
              strokeWidth={2}
              style={{ color: 'oklch(0.55 0.16 145)' }}
            />
            Connected
          </div>
          <p className="mt-1 truncate text-[13px] text-ink-2">{email}</p>
          <p className="mt-0.5 text-[11px] uppercase tracking-[0.16em] text-ink-4">
            Since {new Date(connectedAt).toLocaleDateString('en-IN', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })}
          </p>
        </div>
        {confirming ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-ink-3">Sure?</span>
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex h-10 items-center rounded-sm border border-border bg-surface-1 px-3 text-sm text-ink-2 hover:bg-surface-2"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onDisconnect}
              disabled={disconnecting}
              className="inline-flex h-10 items-center gap-2 rounded-sm px-3 text-sm font-medium text-paper disabled:opacity-60"
              style={{ background: 'var(--color-accent)' }}
            >
              {disconnecting && (
                <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
              )}
              Disconnect
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onAskDisconnect}
            className="inline-flex h-10 items-center gap-2 rounded-sm border border-border bg-surface-1 px-3 text-sm font-medium text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <Unlink className="h-3.5 w-3.5" strokeWidth={2} />
            Disconnect
          </button>
        )}
      </div>

      <p className="rounded-sm border border-border bg-surface-2 p-3 text-[12px] leading-snug text-ink-3">
        New international leads will get a real Google Meet booked on this
        calendar. Existing leads + Indian leads are unaffected.
      </p>
    </div>
  );
}
