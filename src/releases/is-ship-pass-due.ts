import type { Database } from 'bun:sqlite';
import { now } from '../clock/now.ts';
import { getMeta } from '../db/get-meta.ts';
import { CHECKED_AT } from './checked-at.ts';
import { EVERY_MIN } from './every-min.ts';

// Whether the last ship pass is EVERY_MIN minutes old or more, so the watcher runs another.
export function isShipPassDue(db: Database, at: Date = now()): boolean {
  return at.getTime() - Date.parse(getMeta(db, CHECKED_AT) ?? '1970-01-01T00:00:00Z') >= EVERY_MIN * 60_000;
}
