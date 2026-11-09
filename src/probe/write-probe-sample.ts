import type { Database } from 'bun:sqlite';
import type { ProbeSampleInput } from './types.ts';

export function writeProbeSample(db: Database, sample: ProbeSampleInput): void {
  db.query('INSERT OR REPLACE INTO probe_samples (at, target_ok, control_ok, ms, detail, ready_ok) VALUES (?, ?, ?, ?, ?, ?)').run(
    sample.at,
    sample.targetOk ? 1 : 0,
    sample.controlOk === null ? null : sample.controlOk ? 1 : 0,
    sample.durationMs,
    sample.detail,
    sample.readyOk === null ? null : sample.readyOk ? 1 : 0,
  );
}
