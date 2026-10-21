import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { parseAskRow as hydrate } from './parse-ask-row.ts';
import type { Ask, Kind, Row } from './types.ts';

// Eligible to open: queued, or put off and now due. Lowest send order first,
// then items with no order, oldest first. `at` is the time a put-off item must be due by.
// oxlint-disable-next-line zgeoff/function-verb -- named as its callers use it
export function nextEligible(db: Database, kind?: Kind, at: Date = now()): Ask | null {
  const t = iso(at);
  const kindSql = kind ? 'AND kind = ?' : '';
  const args = kind ? [t, kind] : [t];
  const r = db
    .query(
      `SELECT * FROM asks WHERE (state = 'queued' OR (state = 'later' AND due_at <= ?)) ${kindSql}
       ORDER BY send_order IS NULL, send_order, COALESCE(CASE WHEN state = 'later' THEN due_at END, queued_at), id LIMIT 1`,
    )
    .get(...args) as Row | null;
  return hydrate(r);
}
