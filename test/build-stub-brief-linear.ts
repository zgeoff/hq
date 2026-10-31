import type { LinearCall } from '../src/linear/types.ts';

export interface StubBriefIssue {
  description: string | null;
  labels: { name: string; parent?: string }[];
}

// A fake Linear for hq brief: the issue named by the `identifier` variable, with its description
// and labels as Linear gives them, and null for an issue it does not hold. Each id asked goes into
// `asked`.
export function buildStubBriefLinear(issues: Readonly<Record<string, StubBriefIssue>>): { call: LinearCall; asked: string[] } {
  const asked: string[] = [];
  const call: LinearCall = (_query, variables) => {
    const identifier = String(variables['identifier']);
    asked.push(identifier);
    const issue = Object.hasOwn(issues, identifier) ? issues[identifier] : undefined;
    if (issue === undefined) {
      return Promise.resolve({ issue: null });
    }
    const nodes = issue.labels.map((label) => ({ name: label.name, parent: label.parent === undefined ? null : { name: label.parent } }));
    return Promise.resolve({ issue: { identifier, description: issue.description, labels: { nodes } } });
  };
  return { call, asked };
}
