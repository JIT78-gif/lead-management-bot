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
