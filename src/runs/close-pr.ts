import type { Database } from 'bun:sqlite';
import { logEvent } from '../log-event.ts';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { dropTopic } from '../outbox/drop-topic.ts';
import { checkPr } from '../transitions/check-pr.ts';
import { normalizePrRef } from './normalize-pr-ref.ts';
import { requirePR as mustPr } from './require-pr.ts';
import { REVIEWER } from './reviewer.ts';
import type { RunPr } from './types.ts';
import { updateMergedRun } from './update-merged-run.ts';
import { updateRunTime as touch } from './update-run-time.ts';

// What GitHub reports about a merge: the time it happened and the merge commit, when it gave one.
export interface MergeFacts {
  mergedAt: string;
  mergeSha: string | null;
}

export interface PrClose {
  to: 'merged' | 'closed';
  actor: string;
  facts?: MergeFacts | undefined;
}

export function closePr(db: Database, raw: string, close: PrClose): RunPr {
  return db
    .transaction(() => {
      const { ref } = normalizePrRef(raw);
      const pr = mustPr(db, ref);
      checkPr(ref, close.to, pr.state);
      const t = iso(now());
      const mergedAt = close.to === 'merged' ? (close.facts?.mergedAt ?? t) : null;
      const mergeSha = close.to === 'merged' ? (close.facts?.mergeSha ?? null) : null;
      db.query('UPDATE run_prs SET state = ?, merged_at = ?, merge_sha = COALESCE(?, merge_sha), updated_at = ? WHERE ref = ?').run(close.to, mergedAt, mergeSha, t, ref);
      touch(db, pr.issue);
      logEvent(db, 'run', pr.issue, close.to, close.actor, 'open', close.to, { ref });
      dropTopic(db, REVIEWER, `final:${ref}`); // merged or closed: an unsent final notice is moot
      updateMergedRun(db, pr.issue, close.actor);
      return mustPr(db, ref);
    })
    .immediate();
}
