import { HqError } from '../errors.ts';
import { findInstructionHeldTest } from '../noslop/find-instruction-held-test.ts';
import { parseLowerRepo } from '../noslop/parse-lower-repo.ts';
import { readPRFiles } from '../noslop/read-pr-files.ts';
import { roleName } from '../roles/role-name.ts';
import type { Runner } from '../runner/types.ts';
import type { PRRef } from './parse-pr-ref.ts';
import { readPRHead } from './read-pr-head.ts';

export interface ReviewHold {
  head: string;
  files: string[];
}

// What a z-review record needs: the head now and the repo instruction files the PR changes. It
// refuses any other actor, a repo with no instruction hold (hq and hq-private keep the owner's
// lgtm alone) and a PR with no such file.
export async function readReviewHold(run: Runner, ref: PRRef, actor: string): Promise<ReviewHold> {
  if (actor !== roleName('reviewer')) {
    throw new HqError('bad_args', `only ${roleName('reviewer')} records this, not ${actor}`);
  }
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
