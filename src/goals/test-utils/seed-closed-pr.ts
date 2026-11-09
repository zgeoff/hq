import type { ClosedPRRow } from '../write-closed-pr.ts';
import { writeClosedPR } from '../write-closed-pr.ts';
import { buildMockClosedPR } from './build-mock-closed-pr.ts';
import type { GoalsDeps } from './types.ts';

export function seedClosedPR(deps: GoalsDeps, input: Partial<ClosedPRRow> = {}): ClosedPRRow {
  const pr = buildMockClosedPR(input);
  writeClosedPR(deps.db, pr);

  return pr;
}
