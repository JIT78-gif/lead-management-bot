import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Lock } from 'lucide-react';
import { authApi, ApiError } from '../lib/api.ts';

export default function LoginRoute() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [password, setPassword] = useState('');

  const mutation = useMutation({
    mutationFn: (pw: string) => authApi.login(pw),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['auth', 'me'] });
      navigate('/', { replace: true });
    },
  });

  const errorMsg =
    mutation.isError && mutation.error instanceof ApiError
      ? mutation.error.status === 401
        ? 'Wrong password.'
        : mutation.error.message
      : null;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!password) return;
    mutation.mutate(password);
  }

  // Login page is theme-locked — always dark-left + light-right regardless of
  // the user's OS / app theme preference. It's a brand moment, not a workspace.
  return (
    <div className="grid min-h-dvh grid-rows-[auto_1fr] md:grid-cols-2 md:grid-rows-1">
      {/* ── Left / top: editorial poster (always dark) ── */}
      <section
        className="relative flex items-end overflow-hidden p-8 md:items-center md:p-12 lg:p-16"
        style={{ background: '#0a0a0a', color: '#fafafa' }}
      >
        {/* faint grid of dots */}
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'radial-gradient(circle, #fafafa 0.5px, transparent 0.5px)',
            backgroundSize: '14px 14px',
          }}
        />
        {/* accent rule */}
        <div
          aria-hidden
          className="absolute right-0 top-12 hidden h-px w-12 md:block"
          style={{ background: '#ff4d2e' }}
        />

        <div className="relative max-w-md fade-in">
          <div
            className="mb-5 flex items-center gap-2 text-[11px] uppercase tracking-[0.22em]"
            style={{ color: 'rgba(250,250,250,0.55)' }}
          >
            <span
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ background: '#ff4d2e' }}
            />
            Botifys · Lead Desk
          </div>
          <h1 className="font-display text-[44px] font-medium leading-[1.05] tracking-tight md:text-[56px] lg:text-[68px]">
            Every lead.
            <br />
            <span className="italic" style={{ color: 'rgba(250,250,250,0.78)' }}>
              Already qualified.
            </span>
          </h1>
          <p
            className="mt-6 max-w-sm text-[15px] leading-relaxed"
            style={{ color: 'rgba(250,250,250,0.62)' }}
          >
            Your bot does the filtering on WhatsApp. You see only business owners
            who answered every question. Open the desk, work the list.
          </p>

          <div
            className="mt-12 flex items-center gap-6 text-[11px] uppercase tracking-[0.18em]"
            style={{ color: 'rgba(250,250,250,0.4)' }}
          >
            <span>v0.1 · Phase 2</span>
            <span className="h-px w-8" style={{ background: 'rgba(250,250,250,0.2)' }} />
            <span>India</span>
          </div>
        </div>
      </section>

      {/* ── Right / bottom: the form (always light) ── */}
      <section
        className="flex items-center justify-center px-6 py-12 sm:px-12 md:py-16"
        style={{ background: '#fafafa', color: '#0a0a0a' }}
      >
        <form onSubmit={handleSubmit} className="w-full max-w-sm fade-in">
          <div
            className="mb-1 text-[11px] uppercase tracking-[0.22em]"
            style={{ color: '#737373' }}
          >
            Sign in
          </div>
          <h2 className="font-display text-3xl font-medium tracking-tight">
            Welcome back.
          </h2>
          <p className="mt-2 text-sm" style={{ color: '#737373' }}>
            Enter the team password to open the desk.
          </p>

          <label className="mt-10 block">
            <span
              className="mb-2 flex items-center justify-between text-xs font-medium"
              style={{ color: '#404040' }}
            >
              Password
              {mutation.isPending && (
                <span style={{ color: '#a3a3a3' }}>Signing in…</span>
              )}
            </span>
            <div className="relative">
              <Lock
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
                strokeWidth={2}
                style={{ color: '#a3a3a3' }}
              />
              <input
                type="password"
                autoFocus
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={mutation.isPending}
                aria-invalid={errorMsg ? 'true' : 'false'}
                aria-describedby={errorMsg ? 'pw-error' : undefined}
                className="block w-full rounded-sm border py-3 pl-10 pr-3 font-mono text-[15px] transition-colors focus:outline-none disabled:opacity-60"
                style={{
                  background: '#ffffff',
                  borderColor: errorMsg ? '#ff4d2e' : '#e7e7e7',
                  color: '#0a0a0a',
                }}
                placeholder="••••••••••"
              />
            </div>
            {errorMsg && (
              <p
                id="pw-error"
                role="alert"
                className="mt-2 text-xs"
                style={{ color: '#ff4d2e' }}
              >
                {errorMsg}
              </p>
            )}
          </label>

          <button
            type="submit"
            disabled={!password || mutation.isPending}
            className="group mt-6 flex w-full items-center justify-between rounded-sm px-5 py-3 text-sm font-medium transition-all active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
            style={{ background: '#0a0a0a', color: '#fafafa' }}
          >
            <span>Open the desk</span>
            <ArrowRight
              className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
              strokeWidth={2.25}
            />
          </button>

          <p
            className="mt-10 text-[11px] uppercase tracking-[0.18em]"
            style={{ color: '#a3a3a3' }}
          >
            Shared team password · contact owner if lost
          </p>
        </form>
      </section>
    </div>
  );
}
