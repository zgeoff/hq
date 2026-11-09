import invariant from 'tiny-invariant';
import { addPr } from '../add-pr.ts';
import type { RunPr } from '../types.ts';
import type { TestDeps } from '../../test-utils/test-deps.ts';

export interface NewRunPr {
  issue: string;
  ref: string;
}

export function seedRunPr(deps: TestDeps, input: Partial<NewRunPr> = {}): RunPr {
  const pr = addPr(deps.db, input.issue ?? 'GEO-9001', input.ref ?? 'kettle#1', 'delivery-bot');
  invariant(pr.state === 'open');

  return pr;
}
