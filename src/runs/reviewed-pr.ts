import type { Database } from 'bun:sqlite';
import { logEvent } from '../log-event.ts';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { HqError } from '../errors.ts';
import { normalizePRRef } from './normalize-pr-ref.ts';
import { requirePR as mustPR } from './require-pr.ts';
import { SHA } from './sha.ts';
import type { RunPR } from './types.ts';
import { updateRunTime as touch } from './update-run-time.ts';

export interface ReviewedPRInput {
  raw: string;
  sha: string;
  recheck: boolean;
  force: boolean;
}

export function reviewedPR(db: Database, input: ReviewedPRInput, actor: string): RunPR {
  if (!SHA.test(input.sha)) {
    throw new HqError('bad_args', '--sha must be the head sha you reviewed');
  }
  return db
    .transaction(() => {
      const ref = normalizePRRef(input.raw).ref;
      const pr = mustPR(db, ref);
      const round = pr.review_round + 1;
      if (input.recheck && pr.review_round === 0) {
        throw new HqError('bad_state', `${ref} has no first review to re-check`);
      }
      if (!input.recheck && pr.review_round >= 1 && !input.force) {
        throw new HqError('bad_state', `${ref} already had round 1: use --recheck`);
      }
      if (round > 2 && !input.force) {
        throw new HqError('review_limit', `${ref} had a review and a re-check; a third round needs --force (and a reason in a note)`);
      }
      const t = iso(now());
      db.query('UPDATE run_prs SET reviewed_sha = ?, review_round = ?, reviewed_at = ?, updated_at = ? WHERE ref = ?').run(input.sha, round, t, t, ref);
      touch(db, pr.issue);
      logEvent(db, 'run', pr.issue, 'reviewed', actor, null, null, { ref, sha: input.sha, round });
      return mustPR(db, ref);
    })
    .immediate();
}
