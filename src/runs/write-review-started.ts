import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { logEvent } from '../log-event.ts';
import { findOpenPR } from './find-open-pr.ts';
import { REVIEW_MARK_ACTOR } from './review-mark-actor.ts';
import type { RunPr } from './types.ts';

// hq review marks the PR's run itself, so no session has to: the round started, then the head it
// read once it ends ok. A PR on no run is left alone.
export function writeReviewStarted(db: Database, repo: string, pr: number): void {
  db.transaction(() => {
    const found = findOpenPR(db, repo, pr);
    if (found !== null) {
      writeStarted(db, found);
    }
  }).immediate();
}

function writeStarted(db: Database, found: Pick<RunPr, 'ref' | 'issue' | 'review_round'>): void {
  const stamp = iso(now());
  db.query('UPDATE run_prs SET review_started_at = ?, updated_at = ? WHERE ref = ?').run(stamp, stamp, found.ref);
  logEvent(db, 'run', found.issue, 'review-started', REVIEW_MARK_ACTOR, null, null, { ref: found.ref });
}
