import type { IssueType } from './issue-types.ts';

export interface LinearIssue {
  issue: string;
  type: IssueType;
  title: string;
  state: 'completed' | 'canceled' | 'open';
  closed_at: string | null;
}

// A Linear GraphQL call; tests pass a fake.
export type LinearCall = (query: string, variables: Record<string, unknown>) => Promise<unknown>;

export interface Node {
  identifier: string;
  title: string;
  completedAt: string | null;
  canceledAt: string | null;
  labels: { nodes: { name: string; parent: { name: string } | null }[] };
}
