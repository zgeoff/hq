import type { Database } from 'bun:sqlite';

// The newest sample that checked /health/ready (down and blind samples skip it).
export function lastReady(db: Database): { at: string; ready_ok: number } | null {
  return db.query('SELECT at, ready_ok FROM probe_samples WHERE ready_ok IS NOT NULL ORDER BY at DESC LIMIT 1').get() as { at: string; ready_ok: number } | null;
}
