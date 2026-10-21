import type { Database } from 'bun:sqlite';
import { logEvent } from '../log-event.ts';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { HqError } from '../errors.ts';
import { normalizePrRef } from './normalize-pr-ref.ts';
import { requirePR as mustPr } from './require-pr.ts';
import { SHA } from './sha.ts';
import type { RunPr } from './types.ts';
import { updateRunTime as touch } from './update-run-time.ts';

// One review round plus one re-check per PR, as the owner's rules say. A third needs --force.
export function reviewedPr(db: Database, raw: string, sha: string, opts: { recheck: boolean; force: boolean }, actor: string): RunPr {
  if (!SHA.test(sha)) throw new HqError('bad_args', '--sha must be the head sha you reviewed');
  return db
    .transaction(() => {
      const { ref } = normalizePrRef(raw);
      const pr = mustPr(db, ref);
      const round = pr.review_round + 1;
      if (opts.recheck && pr.review_round === 0) throw new HqError('bad_state', `${ref} has no first review to re-check`);
      if (!opts.recheck && pr.review_round >= 1 && !opts.force) throw new HqError('bad_state', `${ref} already had round 1: use --recheck`);
      if (round > 2 && !opts.force) throw new HqError('review_limit', `${ref} had a review and a re-check; a third round needs --force (and a reason in a note)`);
      const t = iso(now());
      db.query('UPDATE run_prs SET reviewed_sha = ?, review_round = ?, reviewed_at = ?, updated_at = ? WHERE ref = ?').run(sha, round, t, t, ref);
      touch(db, pr.issue);
      logEvent(db, 'run', pr.issue, 'reviewed', actor, null, null, { ref, sha, round });
      return mustPr(db, ref);
    })
    .immediate();
}
