import type { Database } from 'bun:sqlite';

export function lastSample(db: Database): { at: string; target_ok: number; control_ok: number | null; ms: number | null; detail: string | null; ready_ok: number | null } | null {
  return db.query('SELECT * FROM probe_samples ORDER BY at DESC LIMIT 1').get() as ReturnType<typeof lastSample>;
}
