import { HqError } from '../errors.ts';
import { getIssueAreas } from '../focus/get-issue-areas.ts';
import type { BriefIssue } from './types.ts';

// The repo the brief is for: the one named with --repo, which must be one of the issue's areas, or
// else the issue's one area label. An issue with several areas needs --repo to pick one.
export function pickIssueRepo(issue: BriefIssue, chosen: string | null = null): string {
  const areas = getIssueAreas(issue.labels.map((label) => label.name));
  if (chosen !== null) {
    if (!areas.includes(chosen)) {
      throw new HqError('bad_args', `--repo ${chosen} is not one of ${issue.identifier}'s areas; it has ${areas.length === 0 ? 'none' : areas.join(', ')}`);
    }
    return chosen;
  }
  const [repo] = areas;
  if (areas.length > 1) {
    throw new HqError('bad_state', `${issue.identifier} has several areas (${areas.join(', ')}): brief one at a time with --repo <area>`);
  }
  if (repo === undefined) {
    throw new HqError('bad_state', `${issue.identifier} needs an area label to name its repo; it has none`);
  }
  return repo;
}
