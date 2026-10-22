import type { ReadyIssue } from '../src/lanes/types.ts';

// A Ready issue as the classifier reads it: no project, labels or parent unless given.
export function buildReadyIssue(identifier: string, over: Partial<ReadyIssue> = {}): ReadyIssue {
  return { identifier, project: null, labels: [], parent: null, ...over };
}
