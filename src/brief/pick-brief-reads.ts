import { pickIssueType } from '../lanes/pick-issue-type.ts';
import { isNoslopListed } from '../noslop/is-noslop-listed.ts';
import type { NoslopSettings } from '../noslop/load-noslop-settings.ts';
import { buildPlaybook } from './build-playbook.ts';
import type { BriefArea } from './pick-brief-areas.ts';
import { pickIssueSize } from './pick-issue-size.ts';
import type { BriefIssue, BriefPlaybook } from './types.ts';

export interface BriefReads {
  // The launch area's label, which can differ from the repo the label maps to.
  label: string;
  repo: string;

  otherAreas: BriefArea[];

  playbook: BriefPlaybook | null;
  stack: boolean;
  imp: boolean;
  reviewLines: boolean;
}

export interface BriefChoice {
  area: BriefArea;
  others: BriefArea[];
  imp: boolean;
}

export function pickBriefReads(issue: BriefIssue, choice: BriefChoice, noslop: NoslopSettings, sha: string): BriefReads {
  const repo = choice.area.repo;
  const type = pickIssueType(issue.labels);
  const size = pickIssueSize(issue.labels);

  // The size label sizes the whole issue, so with other areas it says nothing about this part.
  const stack = (size === 'L' || size === 'XL') && choice.others.length === 0;
  return {
    label: choice.area.label,
    repo,
    otherAreas: choice.others,
    playbook: type === 'none' ? null : buildPlaybook(type, sha),
    stack,
    imp: choice.imp,
    reviewLines: isNoslopListed(noslop, 'zgeoff', repo),
  };
}
