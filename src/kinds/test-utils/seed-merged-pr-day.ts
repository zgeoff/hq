import type { MergedPRDayRow } from '../write-merged-pr-day.ts';
import { writeMergedPRDay } from '../write-merged-pr-day.ts';
import { buildMockMergedPRDay } from './build-mock-merged-pr-day.ts';
import type { KindsDeps } from './types.ts';

export function seedMergedPRDay(deps: KindsDeps, input: Partial<MergedPRDayRow> = {}): MergedPRDayRow {
  const day = buildMockMergedPRDay(input);
  writeMergedPRDay(deps.db, day);

  return day;
}
