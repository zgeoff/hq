// oxlint-disable eslint/id-length -- n is the stored goal_days and merged_pr_days column
import { iso } from '../../clock/iso.ts';
import { writeMergedPRDay } from '../../kinds/write-merged-pr-day.ts';
import { upsertGoalDay } from '../upsert-goal-day.ts';
import type { GoalsDeps } from './types.ts';

export interface FetchedDaysInput {
  from: string;
  to: string;
  repos: readonly string[];
  unfetchedPRDays: readonly string[];
  unfetchedCIDays: readonly string[];
}

const DAY_MS = 86_400_000;

export function seedFetchedDays(deps: GoalsDeps, input: Partial<FetchedDaysInput> = {}): void {
  const range: FetchedDaysInput = { from: '2026-09-01', to: '2026-11-30', repos: ['atc'], unfetchedPRDays: [], unfetchedCIDays: [], ...input };
  const fetchedAt = new Date('2026-09-01T00:00:00Z');
  const days: string[] = [];
  for (let time = Date.parse(`${range.from}T00:00:00Z`); time <= Date.parse(`${range.to}T00:00:00Z`); time += DAY_MS) {
    days.push(new Date(time).toISOString().slice(0, 10));
  }

  // One commit for the whole range: a commit per row makes each test seconds slower.
  deps.db.transaction(() => {
    for (const day of days.filter((candidate) => !range.unfetchedCIDays.includes(candidate))) {
      for (const repo of range.repos) {
        upsertGoalDay(deps.db, { kind: 'ci', key: repo, day, n: 0, at: fetchedAt });
      }
    }
    for (const day of days.filter((candidate) => !range.unfetchedPRDays.includes(candidate))) {
      writeMergedPRDay(deps.db, { day, n: 0, at: iso(fetchedAt) });
    }
  })();
}
