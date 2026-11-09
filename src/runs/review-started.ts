import type { Database } from 'bun:sqlite';
import { logEvent } from '../log-event.ts';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { normalizePRRef } from './normalize-pr-ref.ts';
import { requirePR as mustPR } from './require-pr.ts';
import type { RunPR } from './types.ts';

export function reviewStarted(db: Database, raw: string, actor: string): RunPR {
  return db
    .transaction(() => {
      const ref = normalizePRRef(raw).ref;
      const pr = mustPR(db, ref);
      const t = iso(now());
      db.query('UPDATE run_prs SET review_started_at = ?, updated_at = ? WHERE ref = ?').run(t, t, ref);
      logEvent(db, 'run', pr.issue, 'review-started', actor, null, null, { ref });
      return mustPR(db, ref);
    })
    .immediate();
}
