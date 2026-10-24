import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { setMeta } from '../db/set-meta.ts';
import { PROMOTABLE_FOCUS_KEY } from './promotable-focus-key.ts';

// Keeps the count with the time of the read; null is an unknown count, never none waiting.
export function writePromotableFocus(db: Database, count: number | null): void {
  const record = JSON.stringify({ at: iso(now()), count });
  setMeta(db, PROMOTABLE_FOCUS_KEY, record);
}
