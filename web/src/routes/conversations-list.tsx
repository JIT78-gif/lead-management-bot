import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Inbox } from 'lucide-react';
import {
  conversationsApi,
  type ConversationFilter,
  type ConversationListItem,
} from '../lib/api.ts';
import ConversationCard from '../components/conversation-card.tsx';

const FILTERS: { value: ConversationFilter; label: string; description: string }[] = [
  { value: 'all', label: 'All', description: 'Every conversation' },
  { value: 'active', label: 'Active', description: 'Mid-flow' },
  { value: 'stalled', label: 'Stalled', description: 'Quiet too long' },
  { value: 'disqualified', label: 'Disqualified', description: 'Bot closed the door' },
];

export default function ConversationsListRoute() {
  const [filter, setFilter] = useState<ConversationFilter>('all');
  const [search, setSearch] = useState('');

  const query = useQuery({
    queryKey: ['conversations', filter, search],
    queryFn: () => conversationsApi.list(filter, search || undefined),
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
  });

  const conversations: ConversationListItem[] = query.data?.conversations ?? [];

  return (
    <div className="fade-in">
      {/* ── Page header ── */}
      <div className="mb-8 flex items-end justify-between gap-6">
        <div>
          <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-ink-3">
            <span
              className="inline-block h-1.5 w-1.5 animate-pulse rounded-full"
              style={{ background: 'var(--color-accent)' }}
            />
            Live · every 5s
          </div>
          <h1 className="font-display text-4xl font-medium tracking-tight sm:text-5xl">
            Chats.
          </h1>
          <p className="mt-2 max-w-md text-sm text-ink-3">
            Every WhatsApp conversation as it happens — not just the qualified ones.
          </p>
        </div>
        <div className="hidden text-right sm:block">
          <div className="font-display text-4xl font-medium tabular leading-none">
            {query.isLoading ? '—' : conversations.length}
          </div>
          <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-ink-3">
            in view
          </div>
        </div>
      </div>

      {/* ── Filter pills ── */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
          {FILTERS.map((f) => {
            const active = filter === f.value;
            return (
              <button
                key={f.value}
                type="button"
                onClick={() => setFilter(f.value)}
                className={`shrink-0 rounded-sm px-3 py-2 text-sm font-medium transition-colors sm:px-3.5 ${
                  active
                    ? 'bg-ink text-paper'
                    : 'bg-surface-1 text-ink-3 hover:bg-surface-2 hover:text-ink'
                }`}
                title={f.description}
              >
                {f.label}
              </button>
            );
          })}
        </div>

        <label className="relative block sm:w-72">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-4"
            strokeWidth={2}
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, phone, message"
            className="block w-full rounded-sm border border-border bg-surface-1 py-2 pl-9 pr-3 text-sm placeholder:text-ink-4 focus:border-ink-3 focus:outline-none"
          />
        </label>
      </div>

      {/* ── List ── */}
      {query.isLoading ? (
        <ListSkeleton />
      ) : conversations.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="space-y-2.5">
          {conversations.map((c) => (
            <li key={c.phone}>
              <ConversationCard convo={c} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ListSkeleton() {
  return (
    <ul className="space-y-2.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <li
          key={i}
          className="h-24 animate-pulse rounded-md border border-border bg-surface-2"
        />
      ))}
    </ul>
  );
}

function EmptyState() {
  return (
    <div className="grid place-items-center rounded-md border border-dashed border-border bg-surface-1 px-6 py-16 text-center">
      <Inbox className="mb-3 h-6 w-6 text-ink-4" strokeWidth={1.5} />
      <p className="text-sm text-ink-3">No conversations match that filter yet.</p>
    </div>
  );
}
