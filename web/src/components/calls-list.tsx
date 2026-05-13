import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { callsApi } from '../lib/api.ts';
import CallCard from './call-card.tsx';

/**
 * Renders the calls timeline for a single lead. Polls every 5 seconds while
 * any call is still in `processing` state; goes idle otherwise.
 */
export default function CallsList({ phone }: { phone: string }) {
  const query = useQuery({
    queryKey: ['lead-calls', phone],
    queryFn: () => callsApi.list(phone),
    enabled: !!phone,
    refetchInterval: (q) => {
      const data = q.state.data;
      const hasProcessing = data?.calls?.some((c) => c.status === 'processing');
      return hasProcessing ? 5_000 : false;
    },
  });

  if (query.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-ink-3">
        <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
        Loading calls…
      </div>
    );
  }

  const calls = query.data?.calls ?? [];
  if (calls.length === 0) {
    return (
      <p className="text-sm text-ink-3">
        No calls recorded yet. Tap{' '}
        <strong className="text-ink-2">Start recording</strong> when you make
        the next call, or auto-upload from your phone.
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {calls.map((c) => (
        <li key={c.id}>
          <CallCard call={c} />
        </li>
      ))}
    </ul>
  );
}
