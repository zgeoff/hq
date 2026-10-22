import { match } from 'ts-pattern';
import type { ReadyIssue } from '../lanes/types.ts';
import { getIssueAreas } from './get-issue-areas.ts';
import type { FocusFilter, FocusTerm } from './types.ts';

// An issue matches a term when it matches every filter in it. Maintenance is an issue in a project
// labelled maintenance, or a Bug; everything else is roadmap. Linear's priority 0 is none, never urgent.
export function isFocusMatch(issue: ReadyIssue, term: FocusTerm): boolean {
  return term.filters.every((filter) => isFilterMatch(issue, filter));
}

const PRIORITY_CEILING = { urgent: 1, 'high+': 2, 'medium+': 3 } as const;

function isFilterMatch(issue: ReadyIssue, filter: FocusFilter): boolean {
  return match(filter)
    .with({ kind: 'class' }, (classFilter) => (classFilter.value === 'maintenance') === isMaintenance(issue))
    .with({ kind: 'type' }, (typeFilter) => issue.type.toLowerCase() === typeFilter.value)
    .with({ kind: 'project' }, (projectFilter) => issue.project?.toLowerCase() === projectFilter.value.toLowerCase())
    .with({ kind: 'area' }, (areaFilter) => getIssueAreas(issue.labels).includes(areaFilter.value))
    .with({ kind: 'label' }, (labelFilter) => hasName(issue.labels, labelFilter.value))
    .with({ kind: 'priority' }, (priorityFilter) => issue.priority >= 1 && issue.priority <= PRIORITY_CEILING[priorityFilter.value])
    .exhaustive();
}

function isMaintenance(issue: ReadyIssue): boolean {
  return issue.type === 'Bug' || hasName(issue.projectLabels, 'maintenance');
}

function hasName(names: readonly string[], wanted: string): boolean {
  return names.some((name) => name.toLowerCase() === wanted.toLowerCase());
}
