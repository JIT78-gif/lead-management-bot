import { db } from '../db/client.js';
import type { LeadStatus } from './leads.js';
import type { CallVerdict } from './calls.js';

const DAY_MS = 24 * 60 * 60 * 1000;

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
  verdict_distribution: Record<CallVerdict, number>;
  top_objections: Array<{ objection: string; count: number }>;
}

interface CountRow {
  count: number;
}

interface StatusCountRow {
  status: LeadStatus;
  count: number;
}

interface IndustryCountRow {
  industry: string | null;
  count: number;
}

const stmtAllTime = db.prepare<[], CountRow>('SELECT COUNT(*) AS count FROM leads');
const stmtSinceTs = db.prepare<[number], CountRow>(
  'SELECT COUNT(*) AS count FROM leads WHERE created_at >= ?'
);
const stmtByStatus = db.prepare<[], StatusCountRow>(
  'SELECT status, COUNT(*) AS count FROM leads GROUP BY status'
);
const stmtTopIndustries = db.prepare<[number], IndustryCountRow>(
  `SELECT industry, COUNT(*) AS count
   FROM leads
   WHERE industry IS NOT NULL AND TRIM(industry) <> ''
   GROUP BY LOWER(industry)
   ORDER BY count DESC
   LIMIT ?`
);

function startOfTodayMs(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// ─── Calls aggregations (Phase 3 Stage 5) ──────────────────────

interface CallsAggRow {
  total: number;
  analyzed: number;
  avg_duration: number | null;
}

interface VerdictCountRow {
  verdict: CallVerdict | null;
  count: number;
}

interface ObjectionsRow {
  objections: string;
}

const stmtCallsAgg = db.prepare<[], CallsAggRow>(
  `SELECT
     COUNT(*)                                                                AS total,
     SUM(CASE WHEN status = 'analyzed' THEN 1 ELSE 0 END)                    AS analyzed,
     AVG(CASE WHEN status = 'analyzed' THEN duration_seconds END)            AS avg_duration
   FROM calls`
);

const stmtVerdictDistribution = db.prepare<[], VerdictCountRow>(
  `SELECT verdict, COUNT(*) AS count
   FROM calls
   WHERE status = 'analyzed' AND verdict IS NOT NULL
   GROUP BY verdict`
);

const stmtAllObjections = db.prepare<[], ObjectionsRow>(
  `SELECT objections
   FROM calls
   WHERE status = 'analyzed' AND objections IS NOT NULL AND objections <> '[]'`
);

function getCallsAgg(): DashboardStats['calls'] {
  const row = stmtCallsAgg.get();
  return {
    total: row?.total ?? 0,
    analyzed: row?.analyzed ?? 0,
    avg_duration_seconds: row?.avg_duration ? Math.round(row.avg_duration) : 0,
  };
}

function getVerdictDistribution(): Record<CallVerdict, number> {
  const out: Record<CallVerdict, number> = {
    hot: 0,
    warm: 0,
    cold: 0,
    not_interested: 0,
  };
  for (const row of stmtVerdictDistribution.all()) {
    if (row.verdict && row.verdict in out) {
      out[row.verdict] = row.count;
    }
  }
  return out;
}

function getTopObjections(limit = 5): Array<{ objection: string; count: number }> {
  const counts = new Map<string, { display: string; count: number }>();

  for (const row of stmtAllObjections.all()) {
    let arr: unknown;
    try {
      arr = JSON.parse(row.objections);
    } catch {
      continue;
    }
    if (!Array.isArray(arr)) continue;

    for (const item of arr) {
      if (typeof item !== 'string') continue;
      const trimmed = item.trim();
      if (!trimmed) continue;
      const key = trimmed.toLowerCase();
      const entry = counts.get(key);
      if (entry) {
        entry.count += 1;
      } else {
        counts.set(key, { display: trimmed, count: 1 });
      }
    }
  }

  return Array.from(counts.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map((e) => ({ objection: e.display, count: e.count }));
}

export function getDashboardStats(): DashboardStats {
  const now = Date.now();

  const allTime = stmtAllTime.get()?.count ?? 0;
  const today = stmtSinceTs.get(startOfTodayMs())?.count ?? 0;
  const last7 = stmtSinceTs.get(now - 7 * DAY_MS)?.count ?? 0;
  const last30 = stmtSinceTs.get(now - 30 * DAY_MS)?.count ?? 0;

  const byStatusRows = stmtByStatus.all();
  const by_status: Record<LeadStatus, number> = {
    new_qualified: 0,
    contacted: 0,
    hot: 0,
    cold: 0,
    won: 0,
    lost: 0,
  };
  for (const row of byStatusRows) {
    if (row.status in by_status) {
      by_status[row.status] = row.count;
    }
  }

  const top_industries = stmtTopIndustries.all(5).map((r) => ({
    industry: r.industry ?? 'unknown',
    count: r.count,
  }));

  return {
    totals: {
      all_time: allTime,
      today,
      last_7_days: last7,
      last_30_days: last30,
    },
    by_status,
    top_industries,
    calls: getCallsAgg(),
    verdict_distribution: getVerdictDistribution(),
    top_objections: getTopObjections(5),
  };
}
