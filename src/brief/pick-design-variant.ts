import { parseIssueActions } from './parse-issue-actions.ts';
import { parseIssueSections } from './parse-issue-sections.ts';
import type { BriefIssue } from './types.ts';

export type DesignVariant = { kind: 'with-geoff' } | { kind: 'agent' } | { kind: 'refused'; message: string };

// The same two rules as linear-triage's audit-issues.sh, on the action's name (the words before its
// first comma or colon), so a note after it such as "not with Geoff" counts for nothing.
const AGENT_ACTION = /^agent design pass\b/iu;
const OWNER_ACTION = /\bwith (?:the owner|geoff)\b/iu;

// The design brief an issue takes: with-geoff when it has the `with-geoff` label, since the owner
// joins only then (the tickets skill's Actions table), else the agent pass. An issue whose label and
// Actions line disagree is refused, since either brief would send it to the wrong lane.
export function pickDesignVariant(issue: BriefIssue): DesignVariant {
  const withGeoff = issue.labels.some((label) => label.name.toLowerCase() === 'with-geoff');
  const actions = parseIssueActions(parseIssueSections(issue.description));
  if (withGeoff && actions.some((action) => AGENT_ACTION.test(action))) {
    return { kind: 'refused', message: `${issue.identifier} has the with-geoff label but its Actions line asks for an agent design pass; drop one` };
  }
  if (!withGeoff && actions.some((action) => OWNER_ACTION.test(action))) {
    return { kind: 'refused', message: `${issue.identifier} has no with-geoff label but its Actions line asks for a session with the owner; add the label or change the line` };
  }
  return withGeoff ? { kind: 'with-geoff' } : { kind: 'agent' };
}
