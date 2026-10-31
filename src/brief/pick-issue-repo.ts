import { HqError } from '../errors.ts';
import type { BriefArea } from './pick-brief-areas.ts';
import { pickBriefAreas } from './pick-brief-areas.ts';
import type { BriefIssue } from './types.ts';

export interface IssueRepo {
  area: BriefArea;

  // the issue's other areas, each its own launch
  others: BriefArea[];
}

// The area the brief is for: the one named with --repo, by its label or its repo, which must be
// one of the issue's areas, or else the issue's one area. An issue with several needs --repo.
export function pickIssueRepo(issue: BriefIssue, chosen: string | null = null): IssueRepo {
  const read = pickBriefAreas(issue);
  if (read.kind === 'unknown') {
    throw new HqError('bad_state', `${issue.identifier} has the label ${read.label}, which names no repo hq knows: add it to AREA_REPOS in src/brief/area-repos.ts, or take it off the issue`);
  }
  const areas = read.areas;
  const names = areas.map((area) => area.label).join(', ');
  const area = chosen === null ? areas[0] : areas.find((candidate) => candidate.label === chosen || candidate.repo === chosen);
  if (chosen !== null && area === undefined) {
    throw new HqError('bad_args', `--repo ${chosen} is not one of ${issue.identifier}'s areas; it has ${names === '' ? 'none' : names}`);
  }
  if (chosen === null && areas.length > 1) {
    throw new HqError('bad_state', `${issue.identifier} has several areas (${names}): brief one at a time with --repo <area>`);
  }
  if (area === undefined) {
    throw new HqError('bad_state', `${issue.identifier} needs an area label to name its repo; it has none`);
  }
  return { area, others: areas.filter((other) => other.label !== area.label) };
}
