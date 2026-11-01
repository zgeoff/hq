import { match } from 'ts-pattern';
import type { BriefArea } from './pick-brief-areas.ts';
import { pickBriefAreas } from './pick-brief-areas.ts';
import type { BriefIssue } from './types.ts';

// The area the brief is for, and the issue's other areas, each its own launch; or why there is none.
export type IssueRepo = { kind: 'picked'; area: BriefArea; others: BriefArea[] } | { kind: 'refused'; code: 'bad_args' | 'bad_state'; message: string };

// The one named with --repo, by its label or its repo, which must be one of the issue's areas, or
// else the issue's one area. An issue with several needs --repo.
export function pickIssueRepo(issue: BriefIssue, chosen: string | null = null): IssueRepo {
  return match(pickBriefAreas(issue))
    .with({ kind: 'unknown' }, (unknown): IssueRepo => ({
      kind: 'refused',
      code: 'bad_state',
      message: `${issue.identifier} has the label ${unknown.label}, which names no repo hq knows: add it to FOCUS_AREAS in src/focus/focus-areas.ts and its repo to src/brief/area-repos.ts, or take it off the issue`,
    }))
    .with({ kind: 'known' }, (known) => pickKnownArea(issue.identifier, known.areas, chosen))
    .exhaustive();
}

function pickKnownArea(issue: string, areas: readonly BriefArea[], chosen: string | null): IssueRepo {
  const names = areas.map((area) => area.label).join(', ');
  const area = chosen === null ? areas[0] : areas.find((candidate) => candidate.label === chosen || candidate.repo === chosen);
  if (chosen !== null && area === undefined) {
    return { kind: 'refused', code: 'bad_args', message: `--repo ${chosen} is not one of ${issue}'s areas; it has ${names === '' ? 'none' : names}` };
  }
  if (chosen === null && areas.length > 1) {
    return { kind: 'refused', code: 'bad_state', message: `${issue} has several areas (${names}): brief one at a time with --repo <area>` };
  }
  if (area === undefined) {
    return { kind: 'refused', code: 'bad_state', message: `${issue} needs an area label to name its repo; it has none` };
  }
  return { kind: 'picked', area, others: areas.filter((other) => other.label !== area.label) };
}
