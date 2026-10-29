import type { Database } from 'bun:sqlite';
import { match } from 'ts-pattern';
import { logEvent } from '../log-event.ts';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { enqueue } from '../outbox/enqueue.ts';
import { prAllows } from '../transitions/pr-allows.ts';
import { requirePR as mustPr } from './require-pr.ts';
import { REVIEWER } from './reviewer.ts';
import { sameSha } from './same-sha.ts';
import type { AcceptedFinal, FinalMark } from './types.ts';
import { updateRunTime as touch } from './update-run-time.ts';

// Every final sha leaves an event naming what set it: the cli, or the run_notes row (GEO-1017).
export function scheduleFinalReview(db: Database, mark: FinalMark): boolean {
  const actor = mark.actor,
    note = mark.note,
    pr = mustPr(db, mark.ref),
    ref = mark.ref,
    given = mark.sha,
    resolution = mark.resolution ?? null,
    source = mark.source,
    sha = resolution?.kind === 'full' ? resolution.sha : given;
  if (!prAllows('final', pr.state)) return false;
  if (sameSha(pr.final_sha, sha)) return false;
  const t = iso(now());
  db.query('UPDATE run_prs SET final_sha = ?, final_at = ?, final_source = ?, updated_at = ? WHERE ref = ?').run(sha, t, source, t, ref);
  const seq = logEvent(db, 'run', pr.issue, 'final', actor, pr.final_sha, sha, { ref, sha, source, note, ...describeResolution(given, resolution) });
  touch(db, pr.issue);
  // z-review takes final PRs from this (z-steward, 2026-10-17). A new sha means the head moved: the
  // same message again, on one topic per PR, so an unsent older one is replaced, not doubled.
  enqueue(db, seq, REVIEWER, `Final: ${pr.issue} (${ref} at ${sha.slice(0, 7)}). Review it, then merge.`, `final:${ref}`);
  return true;
}

// What the event keeps of how the sha was settled; nothing when GitHub was not asked.
function describeResolution(given: string, resolution: AcceptedFinal | null): Record<string, unknown> {
  return match(resolution)
    .with(null, () => ({}))
    .with({ kind: 'full' }, () => ({ given, resolved: true }))
    .with({ kind: 'unresolved' }, (unresolved) => ({ given, resolved: false, reason: unresolved.reason }))
    .exhaustive();
}
