import type { StartedPRRow } from '../write-started-pr.ts';
import { writeStartedPR } from '../write-started-pr.ts';
import { buildMockStartedPR } from './build-mock-started-pr.ts';
import type { LinearDeps } from './types.ts';

export function seedStartedPR(deps: LinearDeps, input: Partial<StartedPRRow> = {}): StartedPRRow {
  const pr = buildMockStartedPR(input);
  writeStartedPR(deps.db, pr);

  return pr;
}
