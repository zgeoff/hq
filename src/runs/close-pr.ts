import type { Database } from 'bun:sqlite';
import { logEvent } from '../log-event.ts';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { dropTopic } from '../outbox/drop-topic.ts';
import { checkPR } from '../transitions/check-pr.ts';
import { clearOwnerWait } from './clear-owner-wait.ts';
import { normalizePRRef } from './normalize-pr-ref.ts';
import { requirePR as mustPR } from './require-pr.ts';
import { REVIEWER } from './reviewer.ts';
import type { RunPR } from './types.ts';
import { updateMergedRun } from './update-merged-run.ts';
import { updateRunTime as touch } from './update-run-time.ts';

export interface MergeFacts {
  mergedAt: string;
  mergeSha: string | null;
}

export interface PRClose {
  to: 'merged' | 'closed';
  actor: string;
  facts?: MergeFacts | undefined;
  supersededBy?: string | undefined;
}

export function closePR(db: Database, raw: string, close: PRClose): RunPR {
  return db
    .transaction(() => {
      const ref = normalizePRRef(raw).ref;
      const pr = mustPR(db, ref);
      checkPR(ref, close.to, pr.state);
      const t = iso(now());
      const mergedAt = close.to === 'merged' ? (close.facts?.mergedAt ?? t) : null;
      const mergeSha = close.to === 'merged' ? (close.facts?.mergeSha ?? null) : null;
      db.query('UPDATE run_prs SET state = ?, merged_at = ?, merge_sha = COALESCE(?, merge_sha), updated_at = ? WHERE ref = ?').run(close.to, mergedAt, mergeSha, t, ref);
      touch(db, pr.issue);
      const data = close.supersededBy === undefined ? { ref } : { ref, supersededBy: close.supersededBy };
      logEvent(db, 'run', pr.issue, close.to, close.actor, 'open', close.to, data);
      dropTopic(db, REVIEWER, `final:${ref}`);
      if (close.to === 'merged') {
        clearOwnerWait(db, pr.issue, ref, close.actor);
      }
      updateMergedRun(db, pr.issue, close.actor);
      return mustPR(db, ref);
    })
    .immediate();
}
