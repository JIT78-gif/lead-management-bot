import { Outlet, NavLink, useNavigate } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { authApi } from './lib/api.ts';
import ThemeToggle from './components/theme-toggle.tsx';
import { LogOut } from 'lucide-react';

export default function App() {
  const qc = useQueryClient();
  const navigate = useNavigate();

  const logout = useMutation({
    mutationFn: authApi.logout,
    onSettled: () => {
      qc.clear();
      navigate('/login', { replace: true });
    },
  });

  return (
    <div
      className="grain min-h-dvh bg-paper text-ink"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <header className="sticky top-0 z-30 border-b border-border bg-paper/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4 sm:h-14 sm:px-6">
          {/* Brand */}
          <NavLink to="/" className="flex shrink-0 items-center gap-2">
            <Logo />
            <div className="leading-none">
              <div className="font-display text-[15px] font-semibold tracking-tight">
                Botifys
              </div>
              <div className="mt-0.5 hidden text-[10px] uppercase tracking-[0.18em] text-ink-3 sm:block">
                Lead Desk
              </div>
            </div>
          </NavLink>

          {/* Tabs — visible on mobile too, just compact */}
          <nav className="flex flex-1 items-center justify-center gap-1 px-2 sm:flex-initial sm:justify-start sm:px-4">
            <TabLink to="/" end label="Leads" />
            <TabLink to="/chats" label="Chats" />
            <TabLink to="/stats" label="Stats" />
            <TabLink to="/settings" label="Settings" />
          </nav>

          {/* Actions */}
          <div className="flex shrink-0 items-center gap-1">
            <ThemeToggle />
            <button
              type="button"
              onClick={() => logout.mutate()}
              className="grid h-11 w-11 place-items-center rounded-sm text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink sm:h-9 sm:w-9"
              aria-label="Sign out"
            >
              <LogOut className="h-4 w-4" strokeWidth={2} />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-12">
        <Outlet />
      </main>

      <footer
        className="mx-auto max-w-5xl px-4 pb-8 pt-8 text-[11px] uppercase tracking-[0.18em] text-ink-4 sm:px-6 sm:pb-12"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 2rem)' }}
      >
        Botifys · Internal Tool
      </footer>
    </div>
  );
}

function TabLink({
  to,
  label,
  end,
}: {
  to: string;
  label: string;
  end?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `inline-flex h-11 items-center rounded-sm px-3 text-sm transition-colors sm:h-9 ${
          isActive
            ? 'bg-surface-2 font-medium text-ink'
            : 'text-ink-3 hover:bg-surface-2 hover:text-ink'
        }`
      }
    >
      {label}
    </NavLink>
  );
}

function Logo() {
  return (
    <img
      src="/dashboard/icon.png"
      width={28}
      height={28}
      alt="Botify"
      className="h-7 w-7 rounded-full"
    />
  );
}
