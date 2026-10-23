import { match } from 'ts-pattern';
import { HqError } from '../errors.ts';
import { findInstructionHeldTest } from '../noslop/find-instruction-held-test.ts';
import { parseLowerRepo } from '../noslop/parse-lower-repo.ts';
import { readPRFiles } from '../noslop/read-pr-files.ts';
import { roleName } from '../roles/role-name.ts';
import type { Runner } from '../runner/types.ts';
import type { PRRef } from './parse-pr-ref.ts';
import type { RoleProbe } from './read-role-session.ts';
import { readPRHead } from './read-pr-head.ts';

export interface ReviewHold {
  head: string;
  files: string[];
}

// What a z-review record needs: the head now and the repo instruction files the PR changes. It
// refuses any other actor, a repo with no instruction hold (hq and hq-private keep the owner's
// lgtm alone) and a PR with no such file.
export async function readReviewHold(run: Runner, ref: PRRef, actor: string, probe: RoleProbe): Promise<ReviewHold> {
  if (actor !== roleName('reviewer')) {
    throw new HqError('bad_args', `only ${roleName('reviewer')} records this, not ${actor}`);
  }
  requireReviewerSession(probe);
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

// --by and HQ_AS name z-review on the caller's word alone; the atc session must be z-review's.
function requireReviewerSession(probe: RoleProbe): void {
  match(probe)
    .with({ verdict: 'match' }, () => null)
    .with({ verdict: 'other' }, () => {
      throw new HqError('bad_args', `only ${roleName('reviewer')}'s own atc session records this; this session is not it`);
    })
    .with({ verdict: 'unknown' }, (unknown) => {
      throw new HqError('bad_args', `hq could not check through atc that this is ${roleName('reviewer')}'s session (${unknown.cause}), so no record is stored`);
    })
    .exhaustive();
}
