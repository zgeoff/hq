import { iso } from '../../clock/iso.ts';
import { now } from '../../clock/now.ts';
import type { TestDeps } from '../../test-utils/test-deps.ts';

interface RunPrWithoutRun {
  issue: string;
  ref: string;
  reviewRound: number;
}

export function seedRunPrWithoutRun(deps: TestDeps, input: Partial<RunPrWithoutRun> = {}): void {
  const addedAt = iso(now());

  // A PR whose run is gone: addPr refuses a PR without an open run.
  deps.db.exec('PRAGMA foreign_keys = OFF');
  deps.db
    .query("INSERT INTO run_prs (ref, issue, state, review_round, added_at, updated_at) VALUES (?, ?, 'open', ?, ?, ?)")
    .run(input.ref ?? 'kettle#1', input.issue ?? 'GEO-1', input.reviewRound ?? 0, addedAt, addedAt);
}
