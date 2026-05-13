import { useQuery } from '@tanstack/react-query';
import {
  Sparkle,
  PhoneOutgoing,
  Flame,
  Sun,
  Snowflake,
  Trophy,
  XCircle,
  Mic,
  type LucideIcon,
} from 'lucide-react';
import { statsApi, type DashboardStats, type LeadStatus } from '../lib/api.ts';
import { titleCase } from '../lib/format.ts';

type CallVerdict = 'hot' | 'warm' | 'cold' | 'not_interested';

export default function StatsRoute() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['stats'],
    queryFn: statsApi.get,
    refetchInterval: 60_000,
  });

  if (isLoading) return <StatsSkeleton />;

  if (isError || !data) {
    return (
      <div className="grid place-items-center rounded-md border border-dashed border-border bg-surface-1 px-6 py-16 text-center">
        <h3 className="font-display text-xl font-medium tracking-tight">
          Couldn't load stats.
        </h3>
        <p className="mt-1.5 text-sm text-ink-3">
          Try refreshing the page.
        </p>
      </div>
    );
  }

  return <StatsView stats={data} />;
}

function StatsView({ stats }: { stats: DashboardStats }) {
  const total = stats.totals.all_time;
  const won = stats.by_status.won;
  const winRate = total > 0 ? Math.round((won / total) * 100) : 0;

  return (
    <div className="fade-in space-y-10">
      {/* ── Hero stat ── */}
      <header>
        <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-ink-3">
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ background: 'var(--color-accent)' }}
          />
          Refreshing every minute
        </div>
        <h1 className="font-display text-4xl font-medium tracking-tight sm:text-5xl">
          The shape of business.
        </h1>
      </header>

      {/* ── Big total + win rate ── */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <HeroCard
          label="Qualified leads · all time"
          value={total.toLocaleString('en-IN')}
          accent
        />
        <HeroCard
          label="Win rate"
          value={`${winRate}%`}
          subtitle={`${won.toLocaleString('en-IN')} won of ${total.toLocaleString('en-IN')}`}
        />
      </section>

      {/* ── Time windows ── */}
      <Section title="Volume">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MiniStat label="Today" value={stats.totals.today} />
          <MiniStat label="Last 7 days" value={stats.totals.last_7_days} />
          <MiniStat label="Last 30 days" value={stats.totals.last_30_days} />
          <MiniStat label="All time" value={stats.totals.all_time} />
        </div>
      </Section>

      {/* ── Status distribution ── */}
      <Section title="Pipeline status">
        <PipelineBars by_status={stats.by_status} total={total} />
      </Section>

      {/* ── Top industries ── */}
      <Section title="Top industries">
        {stats.top_industries.length === 0 ? (
          <p className="text-sm text-ink-3">
            No industries recorded yet.
          </p>
        ) : (
          <IndustryBars items={stats.top_industries} />
        )}
      </Section>

      {/* ── Calls overview ── */}
      <Section title="Calls">
        {stats.calls.total === 0 ? (
          <p className="text-sm text-ink-3">
            No calls recorded yet. Record or upload from the lead detail page.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <MiniStat label="Total calls" value={stats.calls.total} />
            <MiniStat label="Analyzed" value={stats.calls.analyzed} />
            <DurationStat
              label="Avg duration"
              seconds={stats.calls.avg_duration_seconds}
            />
          </div>
        )}
      </Section>

      {/* ── Verdict distribution ── */}
      {stats.calls.analyzed > 0 && (
        <Section title="AI verdict distribution">
          <VerdictBars
            distribution={stats.verdict_distribution}
            total={stats.calls.analyzed}
          />
        </Section>
      )}

      {/* ── Top objections ── */}
      {stats.calls.analyzed > 0 && (
        <Section title="Top objections heard">
          {stats.top_objections.length === 0 ? (
            <p className="text-sm text-ink-3">
              No objections logged in analyzed calls yet. (Customers haven't
              pushed back on anything — or all calls so far have been smooth.)
            </p>
          ) : (
            <ObjectionBars items={stats.top_objections} />
          )}
        </Section>
      )}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-4 text-[11px] uppercase tracking-[0.22em] text-ink-3">
        {title}
      </h2>
      {children}
    </section>
  );
}

function HeroCard({
  label,
  value,
  subtitle,
  accent = false,
}: {
  label: string;
  value: string;
  subtitle?: string;
  accent?: boolean;
}) {
  return (
    <div
      className="relative overflow-hidden rounded-md border border-border bg-surface-1 p-6"
    >
      {accent && (
        <div
          aria-hidden
          className="absolute right-0 top-0 h-px w-12"
          style={{ background: 'var(--color-accent)' }}
        />
      )}
      <div className="text-[10px] uppercase tracking-[0.2em] text-ink-3">
        {label}
      </div>
      <div className="mt-2 font-display text-5xl font-medium leading-none tracking-tight tabular sm:text-6xl">
        {value}
      </div>
      {subtitle && (
        <div className="mt-2 text-xs text-ink-3 tabular">{subtitle}</div>
      )}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border bg-surface-1 p-4">
      <div className="text-[10px] uppercase tracking-[0.2em] text-ink-3">
        {label}
      </div>
      <div className="mt-1.5 font-display text-3xl font-medium leading-none tracking-tight tabular">
        {value.toLocaleString('en-IN')}
      </div>
    </div>
  );
}

function DurationStat({ label, seconds }: { label: string; seconds: number }) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  const text = m > 0 ? `${m}m ${s}s` : `${s}s`;
  return (
    <div className="rounded-md border border-border bg-surface-1 p-4">
      <div className="text-[10px] uppercase tracking-[0.2em] text-ink-3">
        {label}
      </div>
      <div className="mt-1.5 flex items-baseline gap-1 font-display text-3xl font-medium leading-none tracking-tight tabular">
        <Mic className="h-4 w-4 self-center text-ink-3" strokeWidth={2} />
        {seconds > 0 ? text : '—'}
      </div>
    </div>
  );
}

interface VerdictDef {
  label: string;
  Icon: LucideIcon;
  color: string;
}

const VERDICT_DEFS: Array<{ key: CallVerdict } & VerdictDef> = [
  { key: 'hot', label: 'Hot', Icon: Flame, color: 'var(--color-accent)' },
  { key: 'warm', label: 'Warm', Icon: Sun, color: 'var(--color-amber)' },
  { key: 'cold', label: 'Cold', Icon: Snowflake, color: 'var(--color-blue)' },
  { key: 'not_interested', label: 'Not interested', Icon: XCircle, color: 'var(--ink-3)' },
];

function VerdictBars({
  distribution,
  total,
}: {
  distribution: Record<CallVerdict, number>;
  total: number;
}) {
  return (
    <div className="space-y-3">
      {VERDICT_DEFS.map((v) => {
        const count = distribution[v.key];
        const pct = total > 0 ? (count / total) * 100 : 0;
        return (
          <div key={v.key} className="flex items-center gap-3 sm:gap-4">
            <div className="flex w-32 shrink-0 items-center gap-2 sm:w-40">
              <v.Icon
                className="h-3.5 w-3.5"
                strokeWidth={2.25}
                style={{ color: v.color }}
              />
              <span className="text-sm text-ink-2">{v.label}</span>
            </div>
            <div className="relative h-2 flex-1 overflow-hidden rounded-xs bg-surface-2">
              <div
                className="absolute inset-y-0 left-0 rounded-xs transition-all duration-500"
                style={{
                  width: `${Math.max(pct, count > 0 ? 2 : 0)}%`,
                  background: v.color,
                }}
              />
            </div>
            <div className="w-12 shrink-0 text-right text-sm font-mono text-ink-2 tabular">
              {count}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ObjectionBars({
  items,
}: {
  items: Array<{ objection: string; count: number }>;
}) {
  const max = Math.max(...items.map((i) => i.count), 1);
  return (
    <div className="space-y-3">
      {items.map((item, i) => (
        <div
          key={item.objection}
          className="rise-in flex items-center gap-3 sm:gap-4"
          style={{ animationDelay: `${i * 40}ms` }}
        >
          <div className="w-40 shrink-0 truncate text-sm text-ink-2 sm:w-56" title={item.objection}>
            {item.objection}
          </div>
          <div className="relative h-2 flex-1 overflow-hidden rounded-xs bg-surface-2">
            <div
              className="absolute inset-y-0 left-0 rounded-xs transition-all duration-500"
              style={{
                width: `${(item.count / max) * 100}%`,
                background: 'var(--color-amber)',
              }}
            />
          </div>
          <div className="w-12 shrink-0 text-right text-sm font-mono text-ink-2 tabular">
            {item.count}
          </div>
        </div>
      ))}
    </div>
  );
}

interface StatusDef {
  label: string;
  Icon: LucideIcon;
  color: string;
}

const STATUS_DEFS: Array<{ key: LeadStatus } & StatusDef> = [
  { key: 'new_qualified', label: 'New', Icon: Sparkle, color: 'var(--color-blue)' },
  { key: 'contacted', label: 'Contacted', Icon: PhoneOutgoing, color: 'var(--color-amber)' },
  { key: 'hot', label: 'Hot', Icon: Flame, color: 'var(--color-accent)' },
  { key: 'cold', label: 'Cold', Icon: Snowflake, color: 'var(--color-slate)' },
  { key: 'won', label: 'Won', Icon: Trophy, color: 'var(--color-emerald)' },
  { key: 'lost', label: 'Lost', Icon: XCircle, color: 'var(--ink-3)' },
];

function PipelineBars({
  by_status,
  total,
}: {
  by_status: Record<LeadStatus, number>;
  total: number;
}) {
  return (
    <div className="space-y-3">
      {STATUS_DEFS.map((s) => {
        const count = by_status[s.key];
        const pct = total > 0 ? (count / total) * 100 : 0;
        return (
          <div key={s.key} className="flex items-center gap-3 sm:gap-4">
            <div className="flex w-28 shrink-0 items-center gap-2 sm:w-32">
              <s.Icon
                className="h-3.5 w-3.5"
                strokeWidth={2.25}
                style={{ color: s.color }}
              />
              <span className="text-sm text-ink-2">{s.label}</span>
            </div>
            <div className="relative h-2 flex-1 overflow-hidden rounded-xs bg-surface-2">
              <div
                className="absolute inset-y-0 left-0 rounded-xs transition-all duration-500"
                style={{
                  width: `${Math.max(pct, count > 0 ? 2 : 0)}%`,
                  background: s.color,
                }}
              />
            </div>
            <div className="w-12 shrink-0 text-right text-sm font-mono text-ink-2 tabular">
              {count}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function IndustryBars({
  items,
}: {
  items: Array<{ industry: string; count: number }>;
}) {
  const max = Math.max(...items.map((i) => i.count), 1);
  return (
    <div className="space-y-3">
      {items.map((item, i) => (
        <div
          key={item.industry}
          className="rise-in flex items-center gap-3 sm:gap-4"
          style={{ animationDelay: `${i * 40}ms` }}
        >
          <div className="w-28 shrink-0 truncate text-sm text-ink-2 sm:w-32">
            {titleCase(item.industry)}
          </div>
          <div className="relative h-2 flex-1 overflow-hidden rounded-xs bg-surface-2">
            <div
              className="absolute inset-y-0 left-0 rounded-xs bg-ink-2 transition-all duration-500"
              style={{ width: `${(item.count / max) * 100}%` }}
            />
          </div>
          <div className="w-12 shrink-0 text-right text-sm font-mono text-ink-2 tabular">
            {item.count}
          </div>
        </div>
      ))}
    </div>
  );
}

function StatsSkeleton() {
  return (
    <div className="space-y-10 fade-in">
      <div className="h-10 w-64 animate-pulse rounded-xs bg-surface-2" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="h-32 animate-pulse rounded-md bg-surface-2" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-md bg-surface-2" />
        ))}
      </div>
    </div>
  );
}
