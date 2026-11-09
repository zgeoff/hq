import type { MergedPRRow } from '../write-merged-pr.ts';
import { writeMergedPR } from '../write-merged-pr.ts';
import { buildMockMergedPR } from './build-mock-merged-pr.ts';
import type { KindsDeps } from './types.ts';

export function seedMergedPR(deps: KindsDeps, input: Partial<MergedPRRow> = {}): MergedPRRow {
  const pr = buildMockMergedPR(input);
  writeMergedPR(deps.db, pr);

  return pr;
}
