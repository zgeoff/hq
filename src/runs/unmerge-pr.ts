import type { Database } from 'bun:sqlite';
import { logEvent } from '../log-event.ts';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { checkPr } from '../transitions/check-pr.ts';
import { normalizePrRef } from './normalize-pr-ref.ts';
import { requirePR as mustPr } from './require-pr.ts';
import type { RunPr } from './types.ts';
import { updateRunTime as touch } from './update-run-time.ts';

// A wrong merged mark back to open, like unfinal for a final mark. The final and review marks stay;
// the merge commit and its shipment go with the merge, so a later merge is checked for release again.
export function unmergePr(db: Database, raw: string, actor: string, reason: string | null): RunPr {
  return db
    .transaction(() => {
      const { ref } = normalizePrRef(raw);
      const pr = mustPr(db, ref);
      checkPr(ref, 'unmerge', pr.state);
      db.query(`UPDATE run_prs SET state = 'open', merged_at = NULL, merge_sha = NULL, shipped_tag = NULL, shipped_at = NULL, updated_at = ? WHERE ref = ?`).run(iso(now()), ref);
      logEvent(db, 'run', pr.issue, 'unmerged', actor, 'merged', 'open', { ref, merged_at: pr.merged_at, merge_sha: pr.merge_sha, shipped_tag: pr.shipped_tag, shipped_at: pr.shipped_at, reason });
      touch(db, pr.issue);
      return mustPr(db, ref);
    })
    .immediate();
}
