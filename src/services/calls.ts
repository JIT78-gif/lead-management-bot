import { db } from '../db/client.js';

export type CallStatus = 'processing' | 'analyzed' | 'failed';
export type CallVerdict = 'hot' | 'warm' | 'cold' | 'not_interested';

export interface CallRow {
  id: number;
  phone: string;
  audio_path: string;
  audio_size_bytes: number;
  duration_seconds: number | null;
  mime_type: string;
  status: CallStatus;
  error: string | null;
  transcript: string | null;
  summary: string | null;          // JSON array of strings
  verdict: CallVerdict | null;
  verdict_confidence: number | null;
  verdict_reasoning: string | null;
  key_points: string | null;       // JSON array
  objections: string | null;       // JSON array
  action_items: string | null;     // JSON array
  created_at: number;
  analyzed_at: number | null;
}

export interface InsertCallInput {
  phone: string;
  audioPath: string;
  audioSizeBytes: number;
  durationSeconds: number | null;
  mimeType: string;
}

export interface AnalysisResult {
  transcript: string;
  summary: string[];
  verdict: CallVerdict;
  verdict_confidence: number;
  verdict_reasoning: string;
  key_points: string[];
  objections: string[];
  action_items: string[];
}

const now = (): number => Date.now();

const stmtInsert = db.prepare(
  `INSERT INTO calls
     (phone, audio_path, audio_size_bytes, duration_seconds, mime_type, status, created_at)
   VALUES (@phone, @audio_path, @audio_size_bytes, @duration_seconds, @mime_type, 'processing', @created_at)`
);

const stmtGet = db.prepare<[number]>('SELECT * FROM calls WHERE id = ?');

const stmtListByPhone = db.prepare<[string]>(
  'SELECT * FROM calls WHERE phone = ? ORDER BY created_at DESC'
);

const stmtUpdateAnalysis = db.prepare(
  `UPDATE calls SET
     status              = 'analyzed',
     error               = NULL,
     transcript          = @transcript,
     summary             = @summary,
     verdict             = @verdict,
     verdict_confidence  = @verdict_confidence,
     verdict_reasoning   = @verdict_reasoning,
     key_points          = @key_points,
     objections          = @objections,
     action_items        = @action_items,
     analyzed_at         = @analyzed_at
   WHERE id = @id`
);

const stmtMarkFailed = db.prepare(
  `UPDATE calls SET status = 'failed', error = @error WHERE id = @id`
);

const stmtMarkProcessing = db.prepare(
  `UPDATE calls SET status = 'processing', error = NULL WHERE id = @id`
);

const stmtDelete = db.prepare<[number]>('DELETE FROM calls WHERE id = ?');

export function insertCall(input: InsertCallInput): CallRow {
  const result = stmtInsert.run({
    phone: input.phone,
    audio_path: input.audioPath,
    audio_size_bytes: input.audioSizeBytes,
    duration_seconds: input.durationSeconds,
    mime_type: input.mimeType,
    created_at: now(),
  });
  const id = Number(result.lastInsertRowid);
  return getCall(id)!;
}

export function getCall(id: number): CallRow | undefined {
  return stmtGet.get(id) as CallRow | undefined;
}

export function listCallsByPhone(phone: string): CallRow[] {
  return stmtListByPhone.all(phone) as CallRow[];
}

export function updateAnalysis(id: number, result: AnalysisResult): void {
  stmtUpdateAnalysis.run({
    id,
    transcript: result.transcript,
    summary: JSON.stringify(result.summary),
    verdict: result.verdict,
    verdict_confidence: result.verdict_confidence,
    verdict_reasoning: result.verdict_reasoning,
    key_points: JSON.stringify(result.key_points),
    objections: JSON.stringify(result.objections),
    action_items: JSON.stringify(result.action_items),
    analyzed_at: now(),
  });
}

export function markFailed(id: number, error: string): void {
  stmtMarkFailed.run({ id, error });
}

export function markProcessing(id: number): void {
  stmtMarkProcessing.run({ id });
}

export function deleteCall(id: number): boolean {
  const result = stmtDelete.run(id);
  return result.changes > 0;
}
