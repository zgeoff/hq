import type { Database } from 'bun:sqlite';
import { HqError } from '../errors.ts';
import { recordTally } from '../followups/record-tally.ts';
import { checkPr } from '../transitions/check-pr.ts';
import { formatFinalRefusal } from './format-final-refusal.ts';
import { normalizePrRef } from './normalize-pr-ref.ts';
import { requirePR as mustPr } from './require-pr.ts';
import { scheduleFinalReview as markFinal } from './schedule-final-review.ts';
import { SHA } from './sha.ts';
import type { FinalResolution, RunPr } from './types.ts';

interface FinalInput {
  sha: string;
  actor: string;
  tally?: { fixed: number | null; followups: string[] | null } | null;
  resolution?: FinalResolution | null;
}

export function finalPr(db: Database, raw: string, input: FinalInput): RunPr {
  const sha = input.sha;
  const actor = input.actor;
  const resolution = input.resolution ?? null;
  const tally = input.tally ?? null;
  if (!SHA.test(sha)) throw new HqError('bad_args', '--sha must be a hex commit sha (7 to 40 characters)');
  return db
    .transaction(() => {
      const { ref } = normalizePrRef(raw);
      const pr = mustPr(db, ref);
      checkPr(ref, 'final', pr.state);
      if (resolution?.kind === 'refused') {
        throw new HqError('bad_args', formatFinalRefusal(ref, sha, resolution));
      }
      markFinal(db, { ref, sha, source: `cli:${actor}`, actor, note: null, resolution });
      if (tally && (tally.fixed !== null || tally.followups !== null)) recordTally(db, ref, pr.issue, tally, actor);
      return mustPr(db, ref);
    })
    .immediate();
}
