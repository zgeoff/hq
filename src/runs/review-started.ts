import type { Database } from 'bun:sqlite';
import { logEvent } from '../log-event.ts';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { normalizePrRef } from './normalize-pr-ref.ts';
import { requirePR as mustPr } from './require-pr.ts';
import type { RunPr } from './types.ts';

export function reviewStarted(db: Database, raw: string, actor: string): RunPr {
  return db
    .transaction(() => {
      const { ref } = normalizePrRef(raw);
      const pr = mustPr(db, ref);
      const t = iso(now());
      db.query('UPDATE run_prs SET review_started_at = ?, updated_at = ? WHERE ref = ?').run(t, t, ref);
      logEvent(db, 'run', pr.issue, 'review-started', actor, null, null, { ref });
      return mustPr(db, ref);
    })
    .immediate();
}
