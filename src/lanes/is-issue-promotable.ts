import { isDescriptionComplete } from './is-description-complete.ts';
import type { BacklogIssue } from './types.ts';

const PARKED_LABEL = 'parked';

// Triage may promote a Backlog issue whose blockers are all completed, whose sections are all filled,
// and that has no parked label. An issue with more relations than one page shows does not qualify,
// since hq cannot see all its blockers.
export function isIssuePromotable(issue: BacklogIssue): boolean {
  const parked = issue.labels.includes(PARKED_LABEL);
  const unblocked = !issue.moreRelations && issue.blockerStates.every((state) => state === 'completed');
  return !parked && unblocked && isDescriptionComplete(issue.description);
}
