import type { CIRunRow } from '../write-ci-run.ts';
import { writeCIRun } from '../write-ci-run.ts';
import { buildMockCIRun } from './build-mock-ci-run.ts';
import type { GoalsDeps } from './types.ts';

export function seedCIRun(deps: GoalsDeps, input: Partial<CIRunRow> = {}): CIRunRow {
  const run = buildMockCIRun(input);
  writeCIRun(deps.db, run);

  return run;
}
