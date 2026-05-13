import { db } from '../db/client.js';
import type { LeadStatus } from './leads.js';

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
  };
}
