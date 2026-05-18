import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Phone,
  Globe,
  Instagram,
  Save,
  Check,
} from 'lucide-react';
import {
  leadsApi,
  type Lead,
  type LeadStatus,
} from '../lib/api.ts';
import { formatPhone, timeAgo, titleCase } from '../lib/format.ts';
import StatusBadge from '../components/status-badge.tsx';
import StatusSelect from '../components/status-select.tsx';
import Conversation from '../components/conversation-bubble.tsx';
import CallUploader from '../components/call-uploader.tsx';
import CallsList from '../components/calls-list.tsx';
import PrecallBriefBanner from '../components/precall-brief.tsx';
import ChatTakeover from '../components/chat-takeover.tsx';

export default function LeadDetailRoute() {
  const { phone = '' } = useParams<{ phone: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const leadQ = useQuery({
    queryKey: ['lead', phone],
    queryFn: () => leadsApi.get(phone),
    enabled: !!phone,
  });

  const messagesQ = useQuery({
    queryKey: ['lead', phone, 'messages'],
    queryFn: () => leadsApi.messages(phone),
    enabled: !!phone,
    // Keep the transcript live so manual replies + customer responses
    // appear without a hard refresh (matches the Chats page cadence).
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
  });

  const updateMutation = useMutation({
    mutationFn: (patch: { status?: LeadStatus; notes?: string }) =>
      leadsApi.update(phone, patch),
    onSuccess: ({ lead }) => {
      qc.setQueryData(['lead', phone], { lead });
      qc.invalidateQueries({ queryKey: ['leads'] });
    },
  });

  // Local notes draft (so typing doesn't trigger re-renders of the whole tree
  // and so we can show "Save" affordance only when changed)
  const [notesDraft, setNotesDraft] = useState<string>('');
  const [notesSavedAt, setNotesSavedAt] = useState<number | null>(null);

  // Hydrate the draft once the lead loads
  useEffect(() => {
    if (leadQ.data?.lead && notesDraft === '') {
      setNotesDraft(leadQ.data.lead.notes ?? '');
    }
  }, [leadQ.data?.lead]); // eslint-disable-line react-hooks/exhaustive-deps

  if (leadQ.isLoading) return <DetailSkeleton />;

  if (leadQ.isError || !leadQ.data?.lead) {
    return (
      <div className="grid place-items-center rounded-md border border-dashed border-border bg-surface-1 px-6 py-16 text-center">
        <h3 className="font-display text-xl font-medium tracking-tight">
          Lead not found.
        </h3>
        <p className="mt-1.5 text-sm text-ink-3">
          That number doesn't have a qualified lead in the desk yet.
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex items-center gap-2 rounded-sm bg-ink px-4 py-2 text-sm font-medium text-paper"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={2.25} />
          Back to leads
        </Link>
      </div>
    );
  }

  const lead = leadQ.data.lead;
  const messages = messagesQ.data?.messages ?? [];
  const notesChanged = notesDraft !== (lead.notes ?? '');

  const handleStatusChange = (next: LeadStatus) => {
    if (next === lead.status) return;
    updateMutation.mutate({ status: next });
  };

  const handleNotesSave = () => {
    if (!notesChanged) return;
    updateMutation.mutate(
      { notes: notesDraft },
      {
        onSuccess: () => setNotesSavedAt(Date.now()),
      }
    );
  };

  return (
    <div className="fade-in pb-28 sm:pb-12">
      {/* ── Back link ── */}
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="-ml-2 inline-flex h-11 items-center gap-1.5 rounded-sm px-3 text-sm text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink sm:h-9 sm:px-2"
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={2.25} />
        Back to leads
      </button>

      {/* ── Pre-call brief (Phase 5) ── */}
      <div className="mt-4">
        <PrecallBriefBanner phone={lead.phone} />
      </div>

      {/* ── Lead identity card ── */}
      <article className="overflow-hidden rounded-md border border-border bg-surface-1">
        {lead.status === 'hot' && (
          <div
            aria-hidden
            className="h-1 w-full"
            style={{ background: 'var(--color-accent)' }}
          />
        )}
        <div className="p-5 sm:p-6">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <StatusBadge status={lead.status} size="md" />
            <span className="text-[11px] uppercase tracking-[0.16em] text-ink-4">
              {timeAgo(lead.created_at)}
            </span>
          </div>

          <h1 className="font-display text-3xl font-medium leading-tight tracking-tight sm:text-4xl">
            {lead.name || 'Unnamed lead'}
          </h1>

          <dl className="mt-5 grid grid-cols-1 gap-x-6 gap-y-3 text-[14px] sm:grid-cols-2">
            {lead.industry && (
              <Row label="Industry" value={titleCase(lead.industry)} />
            )}
            {lead.team_size && (
              <Row label="Team size" value={`${lead.team_size} people`} />
            )}
            <Row
              label="WhatsApp"
              value={
                <span className="font-mono">{formatPhone(lead.phone)}</span>
              }
            />
            {(lead.website_url || lead.social_handle) && (
              <Row
                label={lead.website_url ? 'Website' : 'Social'}
                value={
                  lead.website_url ? (
                    <ExternalLink href={ensureUrl(lead.website_url)}>
                      <Globe className="h-3.5 w-3.5" strokeWidth={2} />
                      {trimUrl(lead.website_url)}
                    </ExternalLink>
                  ) : (
                    <ExternalLink href={socialLink(lead.social_handle!)}>
                      <Instagram className="h-3.5 w-3.5" strokeWidth={2} />
                      {lead.social_handle}
                    </ExternalLink>
                  )
                }
              />
            )}
          </dl>
        </div>
      </article>

      {/* ── Status update ── */}
      <Section label="Status" className="mt-8">
        <StatusSelect
          value={lead.status}
          onChange={handleStatusChange}
          disabled={updateMutation.isPending}
        />
        <p className="mt-2 text-[11px] uppercase tracking-[0.16em] text-ink-4">
          {updateMutation.isPending
            ? 'Saving…'
            : lead.last_status_change_at
              ? `Last changed ${timeAgo(lead.last_status_change_at)}`
              : 'Not yet updated'}
        </p>
      </Section>

      {/* ── Notes ── */}
      <Section label="Sales notes" className="mt-8">
        <textarea
          value={notesDraft}
          onChange={(e) => {
            setNotesDraft(e.target.value);
            setNotesSavedAt(null);
          }}
          placeholder="After the call: what did they want? Budget? Timeline? Objections?"
          className="block min-h-30 w-full resize-y rounded-sm border border-border bg-surface-1 p-3.5 text-[15px] leading-relaxed text-ink placeholder:text-ink-4 focus:border-ink focus:outline-none"
        />
        <div className="mt-3 flex items-center justify-between gap-3">
          <NotesStatus
            saving={updateMutation.isPending}
            savedAt={notesSavedAt}
            changed={notesChanged}
          />
          <button
            type="button"
            disabled={!notesChanged || updateMutation.isPending}
            onClick={handleNotesSave}
            className="inline-flex h-11 items-center gap-2 rounded-sm bg-ink px-4 text-sm font-medium text-paper transition-all active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 sm:h-10"
          >
            <Save className="h-4 w-4" strokeWidth={2.25} />
            Save notes
          </button>
        </div>
      </Section>

      {/* ── Desktop call CTA (mobile uses sticky bottom) ── */}
      <a
        href={`tel:+${lead.phone}`}
        className="mt-8 hidden h-12 w-full items-center justify-center gap-2 rounded-sm bg-ink text-[15px] font-medium text-paper transition-all active:scale-[0.99] sm:inline-flex"
      >
        <Phone className="h-4 w-4" strokeWidth={2.25} />
        Call {lead.name || 'lead'}
      </a>

      {/* ── Calls (Phase 3) ── */}
      <Section label="Calls" className="mt-10">
        <div className="mb-3">
          <CallUploader phone={lead.phone} />
        </div>
        <p className="mb-5 text-[12px] leading-snug text-ink-3">
          Use your phone's built-in call recorder to capture the call, then
          tap above to upload after you hang up. The AI runs in 10–30 seconds
          and adds the summary + verdict to this lead automatically.
        </p>
        <CallsList phone={lead.phone} />
      </Section>

      {/* ── Conversation transcript + manual takeover ── */}
      <Section label="WhatsApp conversation" className="mt-10">
        <div className="mb-4">
          <ChatTakeover
            phone={lead.phone}
            onMessageSent={() => {
              qc.invalidateQueries({ queryKey: ['lead', phone, 'messages'] });
            }}
          />
        </div>
        <Conversation messages={messages} showDeliveryStatus />
      </Section>

      {/* ── Sticky mobile-only call bar ── */}
      <StickyCallBar lead={lead} />
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-3">
      <dt className="w-24 shrink-0 text-[10px] uppercase tracking-[0.18em] text-ink-4">
        {label}
      </dt>
      <dd className="min-w-0 truncate text-ink-2">{value}</dd>
    </div>
  );
}

function Section({
  label,
  children,
  className = '',
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={className}>
      <h2 className="mb-3 text-[11px] uppercase tracking-[0.22em] text-ink-3">
        {label}
      </h2>
      {children}
    </section>
  );
}

function ExternalLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="inline-flex items-center gap-1.5 text-ink-2 underline-offset-2 hover:text-ink hover:underline"
    >
      {children}
    </a>
  );
}

function NotesStatus({
  saving,
  savedAt,
  changed,
}: {
  saving: boolean;
  savedAt: number | null;
  changed: boolean;
}) {
  if (saving)
    return <span className="text-xs text-ink-3">Saving…</span>;
  if (!changed && savedAt) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-500">
        <Check className="h-3 w-3" strokeWidth={2.5} />
        Saved
      </span>
    );
  }
  if (changed)
    return (
      <span className="text-xs text-ink-3">
        Unsaved changes
      </span>
    );
  return <span className="text-xs text-ink-4">Up to date</span>;
}

function StickyCallBar({ lead }: { lead: Lead }) {
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-paper/95 px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-3 backdrop-blur-md sm:hidden"
    >
      <a
        href={`tel:+${lead.phone}`}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-sm bg-ink text-[15px] font-medium text-paper active:scale-[0.99]"
      >
        <Phone className="h-4 w-4" strokeWidth={2.25} />
        Call {lead.name || 'lead'}
      </a>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-8 fade-in">
      <div className="h-8 w-32 animate-pulse rounded-xs bg-surface-2" />
      <div className="space-y-3 rounded-md border border-border bg-surface-1 p-6">
        <div className="h-4 w-20 animate-pulse rounded-xs bg-surface-2" />
        <div className="h-10 w-64 animate-pulse rounded-xs bg-surface-2" />
        <div className="h-3 w-80 animate-pulse rounded-xs bg-surface-2" />
      </div>
      <div className="h-32 animate-pulse rounded-md bg-surface-2" />
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
