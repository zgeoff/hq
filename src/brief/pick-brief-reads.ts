import { pickIssueType } from '../lanes/pick-issue-type.ts';
import { getIssueAreas } from '../focus/get-issue-areas.ts';
import { isNoslopListed } from '../noslop/is-noslop-listed.ts';
import type { NoslopSettings } from '../noslop/load-noslop-settings.ts';
import { buildPlaybook } from './build-playbook.ts';
import { pickIssueRepo } from './pick-issue-repo.ts';
import { pickIssueSize } from './pick-issue-size.ts';
import type { BriefInput, BriefIssue, BriefPlaybook } from './types.ts';

export interface BriefReads {
  repo: string;

  // the issue's other areas when --repo picked one of several; each gets its own launch
  otherAreas: string[];

  // the playbook of the issue's Type, to check at the sha; null when the issue has no Type label
  playbook: BriefPlaybook | null;
  stack: boolean;
  imp: boolean;
  reviewLines: boolean;
}

// What a delivery brief needs read beyond the template and the permission table: the repo of the
// area label, the Type's playbook, the stack line for an L or XL issue, the imp line with --imp,
// and the review lines for a repo noslop reviews.
export function pickBriefReads(issue: BriefIssue, input: Pick<BriefInput, 'imp' | 'repo'>, noslop: NoslopSettings, sha: string): BriefReads {
  const repo = pickIssueRepo(issue, input.repo);
  const otherAreas = getIssueAreas(issue.labels.map((label) => label.name)).filter((area) => area !== repo);
  const type = pickIssueType(issue.labels);
  const size = pickIssueSize(issue.labels);
  return {
    repo,
    otherAreas,
    playbook: type === 'none' ? null : buildPlaybook(type, sha),
    stack: size === 'L' || size === 'XL',
    imp: input.imp,
    reviewLines: isNoslopListed(noslop, 'zgeoff', repo),
  };
}
