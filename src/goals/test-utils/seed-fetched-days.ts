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
  const { from = '2026-09-01', to = '2026-11-30', repos = ['atc'], unfetchedPRDays = [], unfetchedCIDays = [] } = input;
  const fetchedAt = new Date('2026-09-01T00:00:00Z');
  const days: string[] = [];
  for (let time = Date.parse(`${from}T00:00:00Z`); time <= Date.parse(`${to}T00:00:00Z`); time += DAY_MS) {
    days.push(new Date(time).toISOString().slice(0, 10));
  }
  // One commit for the whole range: a commit per row makes each test seconds slower.
  deps.db.transaction(() => {
    for (const day of days.filter((candidate) => !unfetchedCIDays.includes(candidate))) {
      for (const repo of repos) {
        upsertGoalDay(deps.db, { kind: 'ci', key: repo, day, n: 0, at: fetchedAt });
      }
    }
    for (const day of days.filter((candidate) => !unfetchedPRDays.includes(candidate))) {
      writeMergedPRDay(deps.db, { day, n: 0, at: iso(fetchedAt) });
    }
  })();
}
