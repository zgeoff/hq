import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';

interface GoalDay {
  kind: string;
  key: string;
  day: string;
  n: number;
  at: Date;
}

export function upsertGoalDay(db: Database, goalDay: GoalDay): void {
  db.query('INSERT INTO goal_days (kind, key, day, n, at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (kind, key, day) DO UPDATE SET n = excluded.n, at = excluded.at').run(goalDay.kind, goalDay.key, goalDay.day, goalDay.n, iso(goalDay.at));
}
