import { HqError } from '../errors.ts';
import { assertPR } from '../noslop/assert-pr.ts';
import { buildSlug } from '../noslop/build-slug.ts';
import { parseLowerRepo } from '../noslop/parse-lower-repo.ts';
import { OWNER } from '../releases/owner.ts';

export interface PRRef {
  repo: string;
  pr: number;
  slug: string;
}

// Only zgeoff's PRs have a record: the record keys on the repo name alone, so another owner's repo of
// the same name would share it.
export function parsePRRef(rawRepo: string | undefined, rawPR: string | undefined): PRRef {
  if (rawRepo === undefined || rawRepo.trim() === '' || rawPR === undefined || !/^\d+$/u.test(rawPR)) {
    throw new HqError('bad_args', 'usage: <repo> <pr>, with the PR a whole number');
  }
  const parsed = parseLowerRepo(rawRepo, undefined);
  const pr = Number(rawPR);
  assertPR(pr);
  if (parsed.owner !== OWNER) {
    throw new HqError('bad_args', `hq pr keeps records for ${OWNER}'s PRs only, not ${parsed.owner}/${parsed.repo}; give the bare repo name or ${OWNER}/<repo>`);
  }
  return { repo: parsed.repo, pr, slug: buildSlug(parsed) };
}
