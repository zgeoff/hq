import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { setMeta } from '../db/set-meta.ts';
import { PROMOTABLE_FOCUS_KEY } from './promotable-focus-key.ts';

interface PromotableFocusCount {
  // null is an unknown count, never none waiting.
  count: number | null;

  // The buildFocusKey of the focus the count used.
  focus: string;

  // When the read ran.
  at: Date;
  error: string | null;
}

// Keeps the count with the time of the read and the focus it used.
export function writePromotableFocus(db: Database, promotable: PromotableFocusCount): void {
  const record = JSON.stringify({ at: iso(promotable.at), count: promotable.count, focus: promotable.focus, error: promotable.error });
  setMeta(db, PROMOTABLE_FOCUS_KEY, record);
}
