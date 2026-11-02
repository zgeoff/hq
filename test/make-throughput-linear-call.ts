import type { LinearCall } from '../src/linear/types.ts';
import type { FiledNode } from './build-filed-node.ts';

interface StartedSeed {
  identifier: string;
  startedAt: string;
  attachments?: readonly unknown[];
}

// Linear as hq's sync reads it, in one page each: these filed issues, these In Progress ones, and
// an empty answer to every other query.
export function makeThroughputLinearCall(filed: readonly FiledNode[], started: readonly StartedSeed[] = []): LinearCall {
  return (query) => {
    if (query.includes('createdAt: {')) {
      return Promise.resolve(buildPage(filed));
    }
    if (query.includes('"In Progress"')) {
      return Promise.resolve(buildPage(started.map((issue) => buildStartedNode(issue))));
    }
    return Promise.resolve(buildPage([]));
  };
}

function buildPage(nodes: readonly unknown[]) {
  return { issues: { nodes, pageInfo: { hasNextPage: false, endCursor: null } } };
}

function buildStartedNode(issue: StartedSeed) {
  const node = { identifier: issue.identifier, startedAt: issue.startedAt, updatedAt: issue.startedAt };
  return issue.attachments === undefined ? node : { ...node, attachments: { nodes: issue.attachments } };
}
