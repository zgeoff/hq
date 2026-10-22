import type { Database } from 'bun:sqlite';
import { FRESH_MIN } from './fresh-min.ts';
import { goalsAge } from './goals-age.ts';

export const stale = (db: Database, at: Date) => {
  const age = goalsAge(db, at);
  return age === null || age > FRESH_MIN;
};
