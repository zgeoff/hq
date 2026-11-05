import type { LinearCall } from '../src/linear/types.ts';

export interface ReadyNodeSeed {
  identifier: string;
  project?: string | null;
  projectLabels?: string[];
  labels?: string[];
  type?: string;
  priority?: number;
  createdAt?: string;
  parent?: string | null;
  blockers?: { identifier: string; stateType: string }[];
  moreRelations?: boolean;
}

interface ReadyNode {
  identifier: string;
  priority: number;
  createdAt: string;
  project: { name: string; labels: { nodes: { name: string }[] } } | null;
  labels: { nodes: { name: string; parent: { name: string } | null }[] };
  parent: { identifier: string } | null;
  inverseRelations: { nodes: { type: string; issue: { identifier: string; state: { type: string } } }[]; pageInfo: { hasNextPage: boolean } };
}

interface ReadyPage {
  issues: { nodes: ReadyNode[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } };
}

export function buildReadyPage(seeds: ReadyNodeSeed[], endCursor: string | null): ReadyPage {
  const nodes = seeds.map((seed) => ({
    identifier: seed.identifier,
    priority: seed.priority ?? 0,
    createdAt: seed.createdAt ?? '2026-10-01T00:00:00.000Z',
    project: seed.project === undefined || seed.project === null ? null : { name: seed.project, labels: { nodes: (seed.projectLabels ?? []).map((name) => ({ name })) } },
    labels: { nodes: [...(seed.labels ?? []).map((name) => ({ name, parent: null })), ...(seed.type === undefined ? [] : [{ name: seed.type, parent: { name: 'Type' } }])] },
    parent: seed.parent === undefined || seed.parent === null ? null : { identifier: seed.parent },
    inverseRelations: {
      nodes: (seed.blockers ?? []).map((blocker) => ({ type: 'blocks', issue: { identifier: blocker.identifier, state: { type: blocker.stateType } } })),
      pageInfo: { hasNextPage: seed.moreRelations ?? false },
    },
  }));
  return { issues: { nodes, pageInfo: { hasNextPage: endCursor !== null, endCursor } } };
}

export function makePagedCall(first: unknown, second: unknown = first): LinearCall {
  return (_query, variables) => {
    const answer = variables['after'] === null ? first : second;
    return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer);
  };
}
