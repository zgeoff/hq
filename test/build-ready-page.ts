import type { LinearCall } from '../src/linear/types.ts';

export interface ReadyNodeSeed {
  identifier: string;
  project?: string | null;
  labels?: string[];
  parent?: string | null;
}

interface ReadyNode {
  identifier: string;
  project: { name: string } | null;
  labels: { nodes: { name: string }[] };
  parent: { identifier: string } | null;
}

interface ReadyPage {
  issues: { nodes: ReadyNode[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } };
}

// A page of Linear's answer to the Ready query. A non-null `endCursor` says another page follows.
export function buildReadyPage(seeds: ReadyNodeSeed[], endCursor: string | null): ReadyPage {
  const nodes = seeds.map((seed) => ({
    identifier: seed.identifier,
    project: seed.project === undefined || seed.project === null ? null : { name: seed.project },
    labels: { nodes: (seed.labels ?? []).map((name) => ({ name })) },
    parent: seed.parent === undefined || seed.parent === null ? null : { identifier: seed.parent },
  }));
  return { issues: { nodes, pageInfo: { hasNextPage: endCursor !== null, endCursor } } };
}

// A Linear call that answers the first page (no cursor yet) with `first` and any later page with `second`,
// which defaults to `first`. An Error answer rejects, as a failed request does; any other answer, a
// malformed one included, resolves as given.
export function makePagedCall(first: unknown, second: unknown = first): LinearCall {
  return (_query, variables) => {
    const answer = variables['after'] === null ? first : second;
    return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer);
  };
}
