import invariant from 'tiny-invariant';
import type { TestDeps } from '../../test-utils/build-seeder.ts';
import { addPr } from '../add-pr.ts';
import type { RunPr } from '../types.ts';
import { buildMockNewRunPr } from './build-mock-new-run-pr.ts';
import type { NewRunPr } from './build-mock-new-run-pr.ts';

export function seedRunPr(deps: TestDeps, input: Partial<NewRunPr> = {}): RunPr {
  const newPr = buildMockNewRunPr(input);
  const pr = addPr(deps.db, newPr.issue, newPr.ref, 'delivery-bot');
  invariant(pr.state === 'open');

  return pr;
}
