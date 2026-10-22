import type { LinearCall } from '../src/linear/types.ts';
import type { ProjectIssue, ReportIssue } from '../src/shipped/types.ts';

// Linear's GraphQL as the Shipped tab queries it, over these issues: an id query gets each issue it
// names once, in Linear's node shape, and a project query that project's issues in one page. Each
// call's variables go to `asked`.
export function makeLinearFake(issues: readonly ReportIssue[], projectIssues: readonly ProjectIssue[], asked: unknown[] = []): LinearCall {
  return (_query, variables) => {
    asked.push(variables);
    if ('ids' in variables) {
      const ids = variables['ids'] as string[],
        named = ids.flatMap((id) => issues.find((issue) => issue.id === id) ?? []);
      return Promise.resolve({ issues: { nodes: named.map((issue) => toIssueNode(issue)) } });
    }
    const nodes = projectIssues.filter((issue) => issue.project === variables['name']).map((issue) => ({ identifier: issue.id, state: { type: issue.statusType }, project: { name: issue.project } }));
    return Promise.resolve({ issues: { nodes, pageInfo: { hasNextPage: false, endCursor: null } } });
  };
}

// The report fixtures write a priority as a number or as Linear's `{ value, name }`; GraphQL
// answers the number.
function toIssueNode(issue: ReportIssue) {
  const priority = issue.priority as number | { value: number };
  return {
    identifier: issue.id,
    title: issue.title,
    url: issue.url,
    priority: typeof priority === 'number' ? priority : priority.value,
    state: { name: issue.status, type: issue.statusType },
    project: issue.project === null ? null : { name: issue.project },
    labels: { nodes: issue.labels.map((name) => ({ name })) },
  };
}
