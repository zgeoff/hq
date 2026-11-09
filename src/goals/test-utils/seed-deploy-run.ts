import type { DeployRunRow } from '../write-deploy-run.ts';
import { writeDeployRun } from '../write-deploy-run.ts';
import { buildMockDeployRun } from './build-mock-deploy-run.ts';
import type { GoalsDeps } from './types.ts';

export function seedDeployRun(deps: GoalsDeps, input: Partial<DeployRunRow> = {}): DeployRunRow {
  const run = buildMockDeployRun(input);
  writeDeployRun(deps.db, run);

  return run;
}
