import { db } from '../db/client.js';

/**
 * Phase 5 cache for AI-generated artifacts.
 *
 *   kind         | ref_key                | TTL
 *   -------------+------------------------+-----------------------
 *   coaching     | call id (string)       | never (regenerable)
 *   precall_brief| lead phone             | 1h
 *   digest       | ISO week e.g. 2026-W20 | never (sent-marker)
 *   win_pattern  | 'global'               | 7d
 */

export type ArtifactKind =
  | 'coaching'
  | 'precall_brief'
  | 'digest'
  | 'win_pattern';

interface ArtifactRow {
  content: string;
  created_at: number;
  expires_at: number | null;
}

const getStmt = db.prepare<[string, string], ArtifactRow>(
  `SELECT content, created_at, expires_at
     FROM ai_artifacts
    WHERE kind = ? AND ref_key = ?`
);

const upsertStmt = db.prepare(
  `INSERT INTO ai_artifacts (kind, ref_key, content, created_at, expires_at)
   VALUES (?, ?, ?, ?, ?)
   ON CONFLICT(kind, ref_key) DO UPDATE SET
     content    = excluded.content,
     created_at = excluded.created_at,
     expires_at = excluded.expires_at`
);

const deleteStmt = db.prepare(
  `DELETE FROM ai_artifacts WHERE kind = ? AND ref_key = ?`
);

export interface Artifact<T> {
  content: T;
  createdAt: number;
  expiresAt: number | null;
}

export function getArtifact<T = unknown>(
  kind: ArtifactKind,
  refKey: string
): Artifact<T> | null {
  const row = getStmt.get(kind, refKey);
  if (!row) return null;
  if (row.expires_at !== null && row.expires_at < Date.now()) {
    deleteStmt.run(kind, refKey);
    return null;
  }
  return {
    content: JSON.parse(row.content) as T,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

export function putArtifact<T>(
  kind: ArtifactKind,
  refKey: string,
  content: T,
  ttlSec: number | null = null
): void {
  const now = Date.now();
  const expiresAt = ttlSec === null ? null : now + ttlSec * 1000;
  upsertStmt.run(kind, refKey, JSON.stringify(content), now, expiresAt);
}

export function deleteArtifact(kind: ArtifactKind, refKey: string): void {
  deleteStmt.run(kind, refKey);
}
