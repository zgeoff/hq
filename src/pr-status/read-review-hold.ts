import { HqError } from '../errors.ts';
import { findInstructionHeldTest } from '../review-gate/find-instruction-held-test.ts';
import { parseLowerRepo } from '../noslop/parse-lower-repo.ts';
import { readPRFiles } from '../review-gate/read-pr-files.ts';
import type { Runner } from '../runner/types.ts';
import type { PRRef } from './parse-pr-ref.ts';
import type { RoleProbe } from './read-role-session.ts';
import { readPRHead } from './read-pr-head.ts';
import { requireReviewer } from './require-reviewer.ts';

export interface ReviewHold {
  head: string;
  files: string[];
}

export async function readReviewHold(run: Runner, ref: PRRef, actor: string, probe: RoleProbe): Promise<ReviewHold> {
  requireReviewer(actor, probe);
  const isInstruction = findInstructionHeldTest(parseLowerRepo(ref.slug, undefined));
  if (isInstruction === null) {
    throw new HqError('bad_args', `${ref.repo} has no instruction-file hold z-review's records can clear: its held paths need the owner's lgtm`);
  }
  const head = await readPRHead(run, ref.slug, ref.pr);
  if (head === null) {
    throw new HqError('head_unreadable', `could not read ${ref.slug}#${ref.pr}'s head with gh, so no record is stored (it would have no head to be stale against)`);
  }
  const changed = await readPRFiles(run, ref.slug, ref.pr);
  const files = changed.filter((file) => isInstruction(file));
  if (files.length === 0) {
    throw new HqError('bad_args', `${ref.slug}#${ref.pr} changes no repo instruction file, so there is nothing to record`);
  }
  return { head, files };
}
