import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { setMeta } from '../db/set-meta.ts';
import { PROMOTABLE_FOCUS_KEY } from './promotable-focus-key.ts';

interface PromotableFocusCount {
  count: number | null;
  focus: string;
  at: Date;
  error: string | null;
}

export function writePromotableFocus(db: Database, promotable: PromotableFocusCount): void {
  const record = JSON.stringify({ at: iso(promotable.at), count: promotable.count, focus: promotable.focus, error: promotable.error });
  setMeta(db, PROMOTABLE_FOCUS_KEY, record);
}
