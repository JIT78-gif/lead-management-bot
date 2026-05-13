import { useState } from 'react';
import { AlertCircle } from 'lucide-react';

/**
 * Native HTML5 audio player styled to match the dashboard's design language.
 * Mobile browsers render their own native controls (huge thumb-friendly);
 * we just wrap the element with our spacing + a subtle outline.
 *
 * If the file is missing (deleted on disk, expired, never finished uploading)
 * we show a clear error state instead of broken native controls.
 */
export default function AudioPlayer({ callId }: { callId: number }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        className="flex items-center gap-2 rounded-sm border px-3.5 py-3 text-[13px]"
        style={{
          background:
            'color-mix(in oklab, var(--color-accent) 8%, var(--surface-1))',
          borderColor:
            'color-mix(in oklab, var(--color-accent) 25%, transparent)',
          color: 'var(--ink-2)',
        }}
      >
        <AlertCircle
          className="h-4 w-4 shrink-0"
          strokeWidth={2.25}
          style={{ color: 'var(--color-accent)' }}
        />
        Audio file is no longer available.
      </div>
    );
  }

  return (
    <div className="rounded-sm border border-border bg-surface-2 p-3">
      <audio
        controls
        preload="metadata"
        src={`/api/calls/${callId}/audio`}
        onError={() => setFailed(true)}
        className="block w-full"
        style={{ colorScheme: 'light dark' }}
      >
        Your browser does not support the audio element.
      </audio>
    </div>
  );
}
