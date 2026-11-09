import type { Database } from 'bun:sqlite';
import { logEvent } from '../log-event.ts';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { HqError } from '../errors.ts';
import { dropTopic } from '../outbox/drop-topic.ts';
import { checkPR } from '../transitions/check-pr.ts';
import { normalizePRRef } from './normalize-pr-ref.ts';
import { requirePR as mustPR } from './require-pr.ts';
import { REVIEWER } from './reviewer.ts';
import type { RunPR } from './types.ts';
import { updateRunTime as touch } from './update-run-time.ts';

export function unfinalPR(db: Database, raw: string, actor: string, reason: string | null): RunPR {
  return db
    .transaction(() => {
      const ref = normalizePRRef(raw).ref;
      const pr = mustPR(db, ref);
      checkPR(ref, 'unfinal', pr.state);
      if (!pr.final_sha) throw new HqError('bad_state', `${ref} has no final mark`);
      db.query('UPDATE run_prs SET final_sha = NULL, final_at = NULL, final_source = NULL, review_wait_until = NULL, review_wait_sha = NULL, review_wait_reason = NULL, updated_at = ? WHERE ref = ?').run(iso(now()), ref);
      logEvent(db, 'run', pr.issue, 'unfinal', actor, pr.final_sha, null, { ref, source: pr.final_source, reason });
      dropTopic(db, REVIEWER, `final:${ref}`);
      touch(db, pr.issue);
      return mustPR(db, ref);
    })
    .immediate();
}
