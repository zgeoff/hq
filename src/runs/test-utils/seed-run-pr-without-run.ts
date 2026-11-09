import { iso } from '../../clock/iso.ts';
import { now } from '../../clock/now.ts';
import type { TestDeps } from '../../test-utils/build-seeder.ts';
import { buildMockRunPrRow } from './build-mock-run-pr-row.ts';
import type { RunPrRow } from './build-mock-run-pr-row.ts';

export function seedRunPrWithoutRun(deps: TestDeps, input: Partial<RunPrRow> = {}): void {
  const at = iso(now());
  const row = buildMockRunPrRow({ added_at: at, updated_at: at, ...input });
  const columns = Object.keys(row);

  // A PR whose run is gone: addPr refuses a PR without an open run, and the foreign key refuses the row.
  deps.db.exec('PRAGMA foreign_keys = OFF');
  deps.db.query(`INSERT INTO run_prs (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`).run(...Object.values(row));
  deps.db.exec('PRAGMA foreign_keys = ON');
}
