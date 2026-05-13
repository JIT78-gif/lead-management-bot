import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Upload, Loader2, AlertCircle, Check } from 'lucide-react';
import { callsApi, ApiError } from '../lib/api.ts';

type State =
  | { kind: 'idle' }
  | { kind: 'uploading'; filename: string }
  | { kind: 'success'; filename: string }
  | { kind: 'error'; message: string };

const ACCEPTED = 'audio/*,.amr,.3gp,.aac,.m4a,.mp3,.wav,.ogg,.opus';

/**
 * File-picker upload — for when the salesperson recorded the call with their
 * phone's native call recorder and just wants to upload the saved file.
 */
export default function CallUploader({ phone }: { phone: string }) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<State>({ kind: 'idle' });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      // Best-effort duration: try to load the file as audio and read duration.
      // If the codec isn't supported in the browser (e.g. AMR on desktop),
      // we just pass null and let the salesperson see the real duration after
      // analysis.
      const duration = await readDurationSeconds(file).catch(() => null);
      return callsApi.upload(phone, file, duration ?? 0, file.type || guessMime(file.name));
    },
    onMutate: (file: File) => {
      setState({ kind: 'uploading', filename: file.name });
    },
    onSuccess: (_data, file) => {
      qc.invalidateQueries({ queryKey: ['lead-calls', phone] });
      setState({ kind: 'success', filename: file.name });
      setTimeout(() => setState({ kind: 'idle' }), 2500);
    },
    onError: (err: unknown) => {
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Upload failed';
      setState({ kind: 'error', message: msg });
    },
  });

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file
    if (!file) return;
    upload.mutate(file);
  }

  function handlePick() {
    inputRef.current?.click();
  }

  if (state.kind === 'uploading') {
    return (
      <div className="flex items-center gap-3 rounded-md border border-border bg-surface-1 px-4 py-3">
        <Loader2 className="h-4 w-4 animate-spin text-ink-3" strokeWidth={2} />
        <div className="min-w-0 flex-1">
          <div className="text-sm text-ink-2">Uploading recording…</div>
          <div className="truncate font-mono text-[11px] text-ink-4">
            {state.filename}
          </div>
        </div>
      </div>
    );
  }

  if (state.kind === 'success') {
    return (
      <div className="flex items-center gap-3 rounded-md border border-border bg-surface-1 px-4 py-3">
        <Check
          className="h-4 w-4"
          strokeWidth={2.5}
          style={{ color: 'var(--color-emerald)' }}
        />
        <div className="text-sm text-ink-2">
          Uploaded — analysis runs in 10–30 seconds.
        </div>
      </div>
    );
  }

  if (state.kind === 'error') {
    return (
      <div className="space-y-2">
        <div
          className="flex items-start gap-3 rounded-md border px-3.5 py-2.5"
          style={{
            background:
              'color-mix(in oklab, var(--color-accent) 10%, var(--surface-1))',
            borderColor:
              'color-mix(in oklab, var(--color-accent) 30%, transparent)',
          }}
        >
          <AlertCircle
            className="mt-0.5 h-4 w-4 shrink-0"
            strokeWidth={2.25}
            style={{ color: 'var(--color-accent)' }}
          />
          <p className="text-[13px] leading-snug text-ink">{state.message}</p>
        </div>
        <button
          type="button"
          onClick={() => setState({ kind: 'idle' })}
          className="inline-flex h-10 w-full items-center justify-center rounded-sm border border-border bg-surface-1 text-sm font-medium text-ink hover:bg-surface-2"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED}
        className="hidden"
        onChange={handleFileChange}
      />
      <button
        type="button"
        onClick={handlePick}
        className="inline-flex h-14 w-full items-center justify-center gap-2.5 rounded-sm bg-ink text-[15px] font-medium text-paper transition-all active:scale-[0.99]"
      >
        <Upload className="h-4 w-4" strokeWidth={2.25} />
        Upload call recording
      </button>
    </>
  );
}

function guessMime(filename: string): string {
  const ext = filename.toLowerCase().split('.').pop() ?? '';
  switch (ext) {
    case 'mp3':
      return 'audio/mpeg';
    case 'wav':
      return 'audio/wav';
    case 'm4a':
    case 'aac':
      return 'audio/mp4';
    case 'ogg':
    case 'opus':
      return 'audio/ogg';
    case 'webm':
      return 'audio/webm';
    case 'amr':
      return 'audio/amr';
    case '3gp':
      return 'audio/3gpp';
    default:
      return 'application/octet-stream';
  }
}

function readDurationSeconds(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const audio = document.createElement('audio');
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      const d = audio.duration;
      if (Number.isFinite(d) && d > 0) resolve(Math.round(d));
      else reject(new Error('unknown duration'));
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('failed to read'));
    };
    audio.src = url;
  });
}
