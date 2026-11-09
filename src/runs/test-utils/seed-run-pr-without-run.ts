import { iso } from '../../clock/iso.ts';
import { now } from '../../clock/now.ts';
import type { RunsDeps } from './types.ts';
import { buildMockRunPRRow } from './build-mock-run-pr-row.ts';
import type { RunPRRow } from './build-mock-run-pr-row.ts';

export function seedRunPRWithoutRun(deps: RunsDeps, input: Partial<RunPRRow> = {}): void {
  const at = iso(now());
  const row = buildMockRunPRRow({ added_at: at, updated_at: at, ...input });
  const columns = Object.keys(row);

  // A PR whose run is gone: addPR refuses a PR without an open run, and the foreign key refuses the row.
  deps.db.exec('PRAGMA foreign_keys = OFF');
  deps.db.query(`INSERT INTO run_prs (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`).run(...Object.values(row));
  deps.db.exec('PRAGMA foreign_keys = ON');
}
