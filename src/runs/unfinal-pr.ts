import type { Database } from 'bun:sqlite';
import { logEvent } from '../log-event.ts';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { HqError } from '../errors.ts';
import { dropTopic } from '../outbox/drop-topic.ts';
import { checkPr } from '../transitions/check-pr.ts';
import { normalizePrRef } from './normalize-pr-ref.ts';
import { requirePR as mustPr } from './require-pr.ts';
import { REVIEWER } from './reviewer.ts';
import type { RunPr } from './types.ts';
import { updateRunTime as touch } from './update-run-time.ts';

// A final mark that no longer holds: the head moved on and no new final is due yet (z-delivery,
// 2026-10-17). The sweep stops flagging the PR until the next final.
export function unfinalPr(db: Database, raw: string, actor: string, reason: string | null): RunPr {
  return db
    .transaction(() => {
      const { ref } = normalizePrRef(raw);
      const pr = mustPr(db, ref);
      checkPr(ref, 'unfinal', pr.state);
      if (!pr.final_sha) throw new HqError('bad_state', `${ref} has no final mark`);
      db.query('UPDATE run_prs SET final_sha = NULL, final_at = NULL, final_source = NULL, updated_at = ? WHERE ref = ?').run(iso(now()), ref);
      logEvent(db, 'run', pr.issue, 'unfinal', actor, pr.final_sha, null, { ref, source: pr.final_source, reason });
      dropTopic(db, REVIEWER, `final:${ref}`); // an unsent final notice no longer holds
      touch(db, pr.issue);
      return mustPr(db, ref);
    })
    .immediate();
}
