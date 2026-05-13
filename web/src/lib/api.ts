/**
 * Tiny fetch wrapper that sends cookies, parses JSON, and throws on non-2xx.
 * The dashboard is on the same origin as the API in production; in dev the
 * Vite proxy forwards /api to the Fastify server.
 */
export class ApiError extends Error {
  status: number;
  payload: unknown;
  constructor(status: number, message: string, payload: unknown) {
    super(message);
    this.status = status;
    this.payload = payload;
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  const payload = text ? safeJson(text) : null;

  // Session expired or invalidated — bounce to login (skip for the auth
  // endpoints themselves so we don't loop on the initial /me check).
  if (res.status === 401 && !path.startsWith('/api/auth/')) {
    window.dispatchEvent(new CustomEvent('unauthenticated'));
  }

  if (!res.ok) {
    const message =
      (payload as { error?: string })?.error ?? `HTTP ${res.status}`;
    throw new ApiError(res.status, message, payload);
  }

  return payload as T;
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),
};

// ── Typed endpoints ──

export type LeadStatus =
  | 'new_qualified'
  | 'contacted'
  | 'hot'
  | 'cold'
  | 'won'
  | 'lost';

export interface Lead {
  id: number;
  phone: string;
  name: string | null;
  industry: string | null;
  team_size: string | null;
  website_url: string | null;
  social_handle: string | null;
  status: LeadStatus;
  notes: string | null;
  last_status_change_at: number | null;
  created_at: number;
  updated_at: number;
}

export const authApi = {
  login: (password: string) => api.post<{ ok: true }>('/api/auth/login', { password }),
  logout: () => api.post<{ ok: true }>('/api/auth/logout'),
  me: () => api.get<{ authenticated: boolean }>('/api/auth/me'),
};

export interface Message {
  direction: 'in' | 'out';
  text: string;
  created_at: number;
}

export interface DashboardStats {
  totals: {
    all_time: number;
    today: number;
    last_7_days: number;
    last_30_days: number;
  };
  by_status: Record<LeadStatus, number>;
  top_industries: Array<{ industry: string; count: number }>;
  calls: {
    total: number;
    analyzed: number;
    avg_duration_seconds: number;
  };
  verdict_distribution: Record<
    'hot' | 'warm' | 'cold' | 'not_interested',
    number
  >;
  top_objections: Array<{ objection: string; count: number }>;
}

export const leadsApi = {
  list: (filters?: { status?: LeadStatus; search?: string }) => {
    const q = new URLSearchParams();
    if (filters?.status) q.set('status', filters.status);
    if (filters?.search) q.set('search', filters.search);
    const qs = q.toString();
    return api.get<{ leads: Lead[] }>(`/api/leads${qs ? '?' + qs : ''}`);
  },
  get: (phone: string) => api.get<{ lead: Lead }>(`/api/leads/${phone}`),
  messages: (phone: string) =>
    api.get<{ messages: Message[] }>(`/api/leads/${phone}/messages`),
  update: (phone: string, patch: { status?: LeadStatus; notes?: string }) =>
    api.patch<{ lead: Lead }>(`/api/leads/${phone}`, patch),
};

export const statsApi = {
  get: () => api.get<DashboardStats>('/api/stats'),
};

// ── Calls (Phase 3) ──

export type CallStatus = 'processing' | 'analyzed' | 'failed';
export type CallVerdict = 'hot' | 'warm' | 'cold' | 'not_interested';

export interface Call {
  id: number;
  phone: string;
  audio_path: string;
  audio_size_bytes: number;
  duration_seconds: number | null;
  mime_type: string;
  status: CallStatus;
  error: string | null;
  transcript: string | null;
  summary: string | null;          // JSON-encoded string[]
  verdict: CallVerdict | null;
  verdict_confidence: number | null;
  verdict_reasoning: string | null;
  key_points: string | null;       // JSON-encoded string[]
  objections: string | null;       // JSON-encoded string[]
  action_items: string | null;     // JSON-encoded string[]
  created_at: number;
  analyzed_at: number | null;
}

function extFor(mimeType: string): string {
  const lower = mimeType.toLowerCase();
  if (lower.startsWith('audio/webm')) return 'webm';
  if (lower.startsWith('audio/mp4') || lower.includes('m4a') || lower === 'audio/aac') return 'm4a';
  if (lower.startsWith('audio/ogg')) return 'ogg';
  if (lower.startsWith('audio/wav') || lower === 'audio/x-wav') return 'wav';
  if (lower.startsWith('audio/mpeg') || lower === 'audio/mp3') return 'mp3';
  return 'bin';
}

export const callsApi = {
  list: (phone: string) =>
    api.get<{ calls: Call[] }>(`/api/leads/${phone}/calls`),

  get: (id: number) => api.get<{ call: Call }>(`/api/calls/${id}`),

  upload: async (
    phone: string,
    blob: Blob,
    durationSeconds: number,
    mimeType: string
  ): Promise<{ call: Call }> => {
    const fd = new FormData();
    const ext = extFor(mimeType);
    const file = new File([blob], `call.${ext}`, { type: mimeType });
    fd.append('audio', file);
    fd.append('duration_seconds', String(durationSeconds));

    const res = await fetch(`/api/leads/${phone}/calls`, {
      method: 'POST',
      credentials: 'include',
      body: fd,
    });
    const text = await res.text();
    const payload = text ? JSON.parse(text) : null;
    if (!res.ok) {
      throw new ApiError(
        res.status,
        (payload as { error?: string })?.error ?? `HTTP ${res.status}`,
        payload
      );
    }
    return payload as { call: Call };
  },

  reanalyze: (id: number) => api.post<{ call: Call }>(`/api/calls/${id}/analyze`),

  delete: (id: number) => api.del<{ ok: true }>(`/api/calls/${id}`),
};

/** Parse a JSON-encoded array column. Returns [] for null/invalid. */
export function parseJsonArray(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}
