import { HqError } from '../errors.ts';
import { getIssueAreas } from '../focus/get-issue-areas.ts';
import type { BriefIssue } from './types.ts';

// The repo the issue's one area label names; an issue with none or several names no repo.
export function pickIssueRepo(issue: BriefIssue): string {
  const areas = getIssueAreas(issue.labels.map((label) => label.name));
  const [repo] = areas;
  if (areas.length !== 1 || repo === undefined) {
    throw new HqError('bad_state', `${issue.identifier} needs exactly one area label to name its repo; it has ${areas.length === 0 ? 'none' : areas.join(', ')}`);
  }
  return repo;
}
