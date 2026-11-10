import type { Database } from 'bun:sqlite';
import { match } from 'ts-pattern';
import { logEvent } from '../log-event.ts';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { enqueue } from '../outbox/enqueue.ts';
import { recordPRNext } from '../pr-status/record-pr-next.ts';
import { isPRActionAllowed } from '../transitions/is-pr-action-allowed.ts';
import { requirePR as mustPR } from './require-pr.ts';
import { REVIEWER } from './reviewer.ts';
import { sameSha } from './same-sha.ts';
import type { AcceptedFinal, FinalMark } from './types.ts';
import { updateRunTime as touch } from './update-run-time.ts';

export function scheduleFinalReview(db: Database, mark: FinalMark): boolean {
  const actor = mark.actor;
  const note = mark.note;
  const pr = mustPR(db, mark.ref);
  const ref = mark.ref;
  const given = mark.sha;
  const resolution = mark.resolution ?? null;
  const source = mark.source;
  const sha = resolution?.kind === 'full' ? resolution.sha : given;
  if (!isPRActionAllowed('final', pr.state)) {
    return false;
  }
  if (sameSha(pr.final_sha, sha)) {
    return false;
  }
  const t = iso(now());
  db.query('UPDATE run_prs SET final_sha = ?, final_at = ?, final_source = ?, review_wait_until = NULL, review_wait_sha = NULL, review_wait_reason = NULL, updated_at = ? WHERE ref = ?').run(sha, t, source, t, ref);
  const seq = logEvent(db, 'run', pr.issue, 'final', actor, pr.final_sha, sha, { ref, sha, source, note, ...describeResolution(given, resolution) });
  touch(db, pr.issue);
  enqueue(db, seq, REVIEWER, `Final: ${pr.issue} (${ref} at ${sha.slice(0, 7)}). Review it, then merge.`, `final:${ref}`);
  writeReviewerNext(db, ref, actor);
  return true;
}

const BARE_REF = /^(?<repo>[\w.-]+)#(?<pr>\d+)$/u;

// The PR record keys on zgeoff's bare repo name, so a ref with an owner gets no record.
function writeReviewerNext(db: Database, ref: string, actor: string): void {
  const parts = BARE_REF.exec(ref)?.groups;
  if (parts?.['repo'] === undefined || parts['pr'] === undefined) {
    return;
  }
  recordPRNext(db, { repo: parts['repo'].toLowerCase(), pr: Number(parts['pr']) }, REVIEWER, actor);
}

function describeResolution(given: string, resolution: AcceptedFinal | null): Record<string, unknown> {
  return match(resolution)
    .with(null, () => ({ given, resolved: false, reason: 'not resolved in this pass' }))
    .with({ kind: 'full' }, () => ({ given, resolved: true }))
    .with({ kind: 'unresolved' }, (unresolved) => ({ given, resolved: false, reason: unresolved.reason }))
    .exhaustive();
}
