import { z } from 'zod';
import type { LinearCall } from '../src/linear/types.ts';
import type { ProjectIssue, ReportIssue } from '../src/shipped/types.ts';

// The report fixtures write a priority as a number or as Linear's `{ value, name }`; GraphQL
// answers the number.
export type FakeIssue = Omit<ReportIssue, 'priority'> & { readonly priority: number | { readonly value: number; readonly name: string } };

export function makeLinearFake(issues: readonly FakeIssue[], projectIssues: readonly ProjectIssue[], asked: unknown[] = []): LinearCall {
  return (_query, variables) => {
    asked.push(variables);
    if ('ids' in variables) {
      const ids = z.array(z.string()).parse(variables['ids']);
      const named = ids.flatMap((id) => issues.find((issue) => issue.id === id) ?? []);
      return Promise.resolve({ issues: { nodes: named.map((issue) => toIssueNode(issue)) } });
    }
    const nodes = projectIssues.filter((issue) => issue.project === variables['name']).map((issue) => ({ identifier: issue.id, state: { type: issue.statusType }, project: { name: issue.project } }));
    return Promise.resolve({ issues: { nodes, pageInfo: { hasNextPage: false, endCursor: null } } });
  };
}

function toIssueNode(issue: FakeIssue) {
  return {
    identifier: issue.id,
    title: issue.title,
    url: issue.url,
    priority: typeof issue.priority === 'number' ? issue.priority : issue.priority.value,
    state: { name: issue.status, type: issue.statusType },
    project: issue.project === null ? null : { name: issue.project },
    labels: { nodes: issue.labels.map((name) => ({ name })) },
  };
}
