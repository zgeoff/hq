import { HqError } from '../errors.ts';
import type { BriefArea } from './pick-brief-areas.ts';
import { pickBriefAreas } from './pick-brief-areas.ts';
import type { BriefIssue } from './types.ts';

// The area the brief is for: the one named with --repo, by its label or its repo, which must be
// one of the issue's areas, or else the issue's one area. An issue with several needs --repo.
export function pickIssueRepo(issue: BriefIssue, chosen: string | null = null): BriefArea {
  const areas = pickBriefAreas(issue);
  const names = areas.map((area) => area.label).join(', ');
  if (chosen !== null) {
    const area = areas.find((candidate) => candidate.label === chosen || candidate.repo === chosen);
    if (area === undefined) {
      throw new HqError('bad_args', `--repo ${chosen} is not one of ${issue.identifier}'s areas; it has ${names === '' ? 'none' : names}`);
    }
    return area;
  }
  const [area] = areas;
  if (areas.length > 1) {
    throw new HqError('bad_state', `${issue.identifier} has several areas (${names}): brief one at a time with --repo <area>`);
  }
  if (area === undefined) {
    throw new HqError('bad_state', `${issue.identifier} needs an area label to name its repo; it has none`);
  }
  return area;
}
