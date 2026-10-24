import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { logEvent } from '../log-event.ts';
import { findOpenPR } from './find-open-pr.ts';
import { REVIEW_MARK_ACTOR } from './review-mark-actor.ts';
import type { RunPr } from './types.ts';
import { updateRunTime as touch } from './update-run-time.ts';

export interface ReviewedMark {
  countsRound: boolean;
}

export function writeReviewed(db: Database, repo: string, pr: number, head: string, mark: ReviewedMark): void {
  db.transaction(() => {
    const found = findOpenPR(db, repo, pr);
    if (found !== null) {
      writeHead(db, found, head, mark);
    }
  }).immediate();
}

function writeHead(db: Database, found: Pick<RunPr, 'ref' | 'issue' | 'review_round'>, head: string, mark: ReviewedMark): void {
  const round = mark.countsRound ? found.review_round + 1 : found.review_round;
  const stamp = iso(now());
  db.query('UPDATE run_prs SET reviewed_sha = ?, review_round = ?, reviewed_at = ?, updated_at = ? WHERE ref = ?').run(head, round, stamp, stamp, found.ref);
  touch(db, found.issue);
  logEvent(db, 'run', found.issue, 'reviewed', REVIEW_MARK_ACTOR, null, null, { ref: found.ref, sha: head, round });
}
