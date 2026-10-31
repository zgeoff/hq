import { pickIssueType } from '../lanes/pick-issue-type.ts';
import { isNoslopListed } from '../noslop/is-noslop-listed.ts';
import type { NoslopSettings } from '../noslop/load-noslop-settings.ts';
import { buildPlaybook } from './build-playbook.ts';
import type { BriefArea } from './pick-brief-areas.ts';
import { pickIssueSize } from './pick-issue-size.ts';
import type { BriefIssue, BriefPlaybook } from './types.ts';

export interface BriefReads {
  repo: string;

  // the issue's other areas when --repo picked one of several; each gets its own launch
  otherAreas: BriefArea[];

  // the playbook of the issue's Type, to check at the sha; null when the issue has no Type label
  playbook: BriefPlaybook | null;
  stack: boolean;
  imp: boolean;
  reviewLines: boolean;
}

// The area the brief is for, its issue's other areas, and whether it runs on an imp.
export interface BriefChoice {
  area: BriefArea;
  others: BriefArea[];
  imp: boolean;
}

// What a delivery brief needs read beyond the template and the permission table: the picked area's
// repo, the Type's playbook, the stack line for an L or XL issue, the imp line with --imp,
// and the review lines for a repo noslop reviews.
export function pickBriefReads(issue: BriefIssue, choice: BriefChoice, noslop: NoslopSettings, sha: string): BriefReads {
  const repo = choice.area.repo;
  const type = pickIssueType(issue.labels);
  const size = pickIssueSize(issue.labels);
  return {
    repo,
    otherAreas: choice.others,
    playbook: type === 'none' ? null : buildPlaybook(type, sha),
    stack: size === 'L' || size === 'XL',
    imp: choice.imp,
    reviewLines: isNoslopListed(noslop, 'zgeoff', repo),
  };
}
