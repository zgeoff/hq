import type { Database } from 'bun:sqlite';
import type { ProbeSampleInput } from './types.ts';

export function writeProbeSample(db: Database, sample: ProbeSampleInput): void {
  const targetFlag = toFlag(sample.targetOk);
  const controlFlag = sample.controlOk === null ? null : toFlag(sample.controlOk);
  const readyFlag = sample.readyOk === null ? null : toFlag(sample.readyOk);
  db.query('INSERT OR REPLACE INTO probe_samples (at, target_ok, control_ok, ms, detail, ready_ok) VALUES (?, ?, ?, ?, ?, ?)').run(sample.at, targetFlag, controlFlag, sample.durationMs, sample.detail, readyFlag);
}

function toFlag(value: boolean): number {
  return value ? 1 : 0;
}
