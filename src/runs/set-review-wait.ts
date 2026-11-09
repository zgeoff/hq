import type { Database } from 'bun:sqlite';
import { match } from 'ts-pattern';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { HqError } from '../errors.ts';
import { parseCapUntil } from '../lanes/cap/parse-cap-until.ts';
import { logEvent } from '../log-event.ts';
import { normalizePRRef } from './normalize-pr-ref.ts';
import { pickReviewWait } from './pick-review-wait.ts';
import type { ReviewWaitRequest } from './pick-review-wait.ts';
import { requirePR as mustPR } from './require-pr.ts';
import type { RunPR } from './types.ts';
import { updateRunTime as touch } from './update-run-time.ts';

export type ReviewWaitInput = { clear: true } | { clear: false; until: string | undefined; reason: string | undefined };

export function setReviewWait(db: Database, raw: string, input: ReviewWaitInput, actor: string): RunPR {
  return db
    .transaction(() => {
      const ref = normalizePRRef(raw).ref;
      const pr = mustPR(db, ref);
      const at = now();
      const request = buildRequest(input, at);
      const write = pickReviewWait(pr, request);
      if (!write.ok) {
        throw new HqError('bad_state', write.refusal);
      }
      db.query('UPDATE run_prs SET review_wait_until = ?, review_wait_sha = ?, review_wait_reason = ?, updated_at = ? WHERE ref = ?').run(write.until, write.sha, write.reason, iso(at), ref);
      const action = match(request)
        .with({ kind: 'clear' }, () => 'review-wait-cleared')
        .with({ kind: 'set' }, () => 'review-wait')
        .exhaustive();
      logEvent(db, 'run', pr.issue, action, actor, null, null, { ref, sha: write.sha, until: write.until, reason: write.reason });
      touch(db, pr.issue);
      return mustPR(db, ref);
    })
    .immediate();
}

function buildRequest(input: ReviewWaitInput, at: Date): ReviewWaitRequest {
  return match(input)
    .with({ clear: true }, (): ReviewWaitRequest => ({ kind: 'clear' }))
    .with({ clear: false }, (set): ReviewWaitRequest => {
      if (set.until === undefined) {
        throw new HqError('bad_args', '--until is required: an ISO time or a Sydney time such as Mon 08:00, or --clear');
      }
      return { kind: 'set', until: parseCapUntil(set.until, at), reason: set.reason ?? null };
    })
    .exhaustive();
}
