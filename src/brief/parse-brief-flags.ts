import type { Flags } from '../cli.ts';
import { HqError } from '../errors.ts';
import type { BriefInput } from './types.ts';

const ISSUE_ID = /^[A-Z][A-Z0-9]*-\d+$/u;

// A git ref: branch, tag or sha characters only, so it fits the gh api path it goes into.
const REF = /^[\w][\w./-]*$/u;

// An area label or its repo name, as AREA_REPOS holds them.
const AREA = /^[a-z0-9][a-z0-9-]*$/u;

export function parseBriefFlags(issue: string | undefined, flags: Flags): BriefInput {
  if (issue === undefined || !ISSUE_ID.test(issue)) {
    throw new HqError('bad_args', 'hq brief <issue> needs a Linear issue ID such as GEO-123');
  }
  const ref = flags.ref ?? 'main';
  if (!REF.test(ref) || ref.includes('..')) {
    throw new HqError('bad_args', `--ref must be a branch, tag or commit: ${ref}`);
  }
  if (flags['issue-by-link'] === true && flags['goal-file'] !== undefined) {
    throw new HqError('bad_args', 'give --issue-by-link or --goal-file, not both');
  }
  const repo = flags.repo ?? null;
  if (repo !== null && !AREA.test(repo)) {
    throw new HqError('bad_args', `--repo must be an area label or repo such as cloud: ${repo}`);
  }
  const imp = flags.imp === true;
  const goalFile = flags['goal-file'] ?? null;

  // An imp agent reads Linear itself, and the issue body pushes an imp brief past the limit.
  const byLink = flags['issue-by-link'] === true || (imp && goalFile === null);
  return { issue, ref, imp, byLink, goalFile, repo };
}
