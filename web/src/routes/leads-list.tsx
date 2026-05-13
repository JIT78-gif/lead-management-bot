import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Phone, Search, Globe, Instagram, Inbox, ChevronRight } from 'lucide-react';
import { leadsApi, type Lead, type LeadStatus } from '../lib/api.ts';
import { formatPhone, timeAgo, titleCase } from '../lib/format.ts';
import StatusBadge from '../components/status-badge.tsx';

type Filter = 'all' | LeadStatus;

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'new_qualified', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'hot', label: 'Hot' },
  { value: 'cold', label: 'Cold' },
  { value: 'won', label: 'Won' },
  { value: 'lost', label: 'Lost' },
];

export default function LeadsListRoute() {
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');

  const query = useQuery({
    queryKey: ['leads', filter, search],
    queryFn: () =>
      leadsApi.list({
        status: filter === 'all' ? undefined : filter,
        search: search || undefined,
      }),
    refetchInterval: 30_000,
  });

  const leads = query.data?.leads ?? [];

  const counts = useMemo(() => {
    const c: Record<Filter, number> = {
      all: leads.length,
      new_qualified: 0,
      contacted: 0,
      hot: 0,
      cold: 0,
      won: 0,
      lost: 0,
    };
    for (const l of leads) c[l.status] += 1;
    return c;
  }, [leads]);

  return (
    <div className="fade-in">
      {/* ── Editorial page header ── */}
      <div className="mb-10 flex items-end justify-between gap-6">
        <div>
          <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-ink-3">
            <span
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ background: 'var(--color-accent)' }}
            />
            Live · refreshing every 30s
          </div>
          <h1 className="font-display text-4xl font-medium tracking-tight sm:text-5xl">
            Qualified leads.
          </h1>
        </div>
        <div className="hidden text-right sm:block">
          <div className="font-display text-4xl font-medium tabular leading-none">
            {query.isLoading ? '—' : leads.length}
          </div>
          <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-ink-3">
            in view
          </div>
        </div>
      </div>

      {/* ── Filter bar ── */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
          {FILTERS.map((f) => {
            const active = filter === f.value;
            return (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={`shrink-0 rounded-sm px-3 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? 'bg-ink text-paper'
                    : 'bg-surface-2 text-ink-2 hover:bg-border'
                }`}
              >
                <span>{f.label}</span>
                {!active && counts[f.value] > 0 && (
                  <span className="ml-1.5 text-ink-4 tabular">
                    {counts[f.value]}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="relative shrink-0 sm:w-64">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-4"
            strokeWidth={2}
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, industry…"
            className="w-full rounded-sm border border-border bg-surface-1 py-2 pl-9 pr-3 text-sm placeholder:text-ink-4 focus:border-ink focus:outline-none"
          />
        </div>
      </div>

      {/* ── List ── */}
      {query.isLoading && <LoadingSkeleton />}

      {!query.isLoading && leads.length === 0 && <EmptyState />}

      {!query.isLoading && leads.length > 0 && (
        <ul className="space-y-3">
          {leads.map((lead, i) => (
            <li
              key={lead.id}
              className="rise-in"
              style={{ animationDelay: `${Math.min(i * 40, 240)}ms` }}
            >
              <LeadCard lead={lead} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function LeadCard({ lead }: { lead: Lead }) {
  const name = lead.name || 'Unnamed lead';
  const industry = lead.industry ? titleCase(lead.industry) : null;
  const teamSize = lead.team_size;
  const phone = formatPhone(lead.phone);

  // Stop the card-level navigation when the user taps Call or an external link.
  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <article className="group relative overflow-hidden rounded-md border border-border bg-surface-1 transition-all hover:border-border-strong hover:bg-paper-elevated">
      {/* Accent stripe — only for "hot" */}
      {lead.status === 'hot' && (
        <div
          aria-hidden
          className="absolute inset-y-0 left-0 w-px"
          style={{ background: 'var(--color-accent)' }}
        />
      )}

      {/* Full-card link overlay — makes the whole card tappable to detail.
          Sits beneath interactive elements via z-index. */}
      <Link
        to={`/lead/${lead.phone}`}
        aria-label={`Open ${name}`}
        className="absolute inset-0 z-0"
      />

      <div className="relative z-10 grid gap-4 p-5 sm:grid-cols-[1fr_auto] sm:items-center sm:gap-6">
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-3">
            <StatusBadge status={lead.status} size="sm" />
            <span className="text-[11px] uppercase tracking-[0.16em] text-ink-4">
              {timeAgo(lead.created_at)}
            </span>
          </div>

          <h3 className="font-display text-[26px] font-medium leading-tight tracking-tight">
            {name}
            <ChevronRight
              className="ml-1 inline h-4 w-4 -translate-y-0.75 text-ink-4 opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100"
              strokeWidth={2.25}
            />
          </h3>

          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-2">
            {industry && <span>{industry}</span>}
            {industry && teamSize && <span className="text-ink-4">·</span>}
            {teamSize && <span className="text-ink-3">{teamSize} people</span>}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px]">
            <span className="font-mono text-ink-2">{phone}</span>
            {lead.website_url && (
              <a
                href={ensureUrl(lead.website_url)}
                target="_blank"
                rel="noreferrer noopener"
                onClick={stop}
                className="relative z-20 inline-flex items-center gap-1 text-ink-3 underline-offset-2 hover:text-ink hover:underline"
              >
                <Globe className="h-3 w-3" strokeWidth={2} />
                {trimUrl(lead.website_url)}
              </a>
            )}
            {!lead.website_url && lead.social_handle && (
              <a
                href={socialLink(lead.social_handle)}
                target="_blank"
                rel="noreferrer noopener"
                onClick={stop}
                className="relative z-20 inline-flex items-center gap-1 text-ink-3 underline-offset-2 hover:text-ink hover:underline"
              >
                <Instagram className="h-3 w-3" strokeWidth={2} />
                {lead.social_handle}
              </a>
            )}
          </div>
        </div>

        <a
          href={`tel:+${lead.phone}`}
          onClick={stop}
          className="relative z-20 inline-flex h-11 items-center justify-center gap-2 rounded-sm bg-ink px-5 text-sm font-medium text-paper transition-all hover:bg-ink/90 active:scale-[0.99] sm:h-10"
        >
          <Phone className="h-4 w-4" strokeWidth={2.25} />
          Call
        </a>
      </div>
    </article>
  );
}

function LoadingSkeleton() {
  return (
    <ul className="space-y-3">
      {[0, 1, 2].map((i) => (
        <li
          key={i}
          className="rise-in h-32 rounded-md border border-border bg-surface-1"
          style={{ animationDelay: `${i * 40}ms` }}
        >
          <div className="space-y-3 p-5">
            <div className="h-3 w-24 animate-pulse rounded-xs bg-surface-2" />
            <div className="h-7 w-48 animate-pulse rounded-xs bg-surface-2" />
            <div className="h-3 w-64 animate-pulse rounded-xs bg-surface-2" />
          </div>
        </li>
      ))}
    </ul>
  );
}

function EmptyState() {
  return (
    <div className="grid place-items-center rounded-md border border-dashed border-border bg-surface-1 px-6 py-16 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-full bg-surface-2 text-ink-3">
        <Inbox className="h-5 w-5" strokeWidth={1.75} />
      </div>
      <h3 className="mt-5 font-display text-xl font-medium tracking-tight">
        No leads match this view.
      </h3>
      <p className="mt-1.5 max-w-sm text-sm text-ink-3">
        Either no one has come through WhatsApp yet, or your filter is too narrow.
        Try “All” above.
      </p>
    </div>
  );
}

function ensureUrl(raw: string): string {
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw}`;
}

function trimUrl(raw: string): string {
  return raw.replace(/^https?:\/\//i, '').replace(/\/$/, '');
}

function socialLink(handle: string): string {
  if (handle.startsWith('http')) return handle;
  const clean = handle.replace(/^@/, '');
  return `https://instagram.com/${clean}`;
}
