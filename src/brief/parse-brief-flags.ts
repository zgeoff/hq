import type { Flags } from '../cli.ts';
import { HqError } from '../errors.ts';
import type { BriefInput } from './types.ts';

const ISSUE_ID = /^[A-Z][A-Z0-9]*-\d+$/u;

// A git ref: branch, tag or sha characters only, so it fits the gh api path it goes into.
const REF = /^[\w][\w./-]*$/u;

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
  return { issue, ref, imp: flags.imp === true, byLink: flags['issue-by-link'] === true, goalFile: flags['goal-file'] ?? null };
}
