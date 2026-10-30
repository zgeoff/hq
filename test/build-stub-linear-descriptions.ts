import type { LinearCall } from '../src/linear/types.ts';

export function buildStubLinearDescriptions(descriptions: Readonly<Record<string, string>>): { call: LinearCall; asked: unknown[] } {
  const asked: unknown[] = [];
  const call: LinearCall = (_query, variables) => {
    const ids = variables['ids'];
    if (!Array.isArray(ids)) {
      return Promise.resolve({ issues: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } });
    }
    asked.push(ids);
    const known = ids.filter((id): id is string => typeof id === 'string' && Object.hasOwn(descriptions, id));
    return Promise.resolve({ issues: { nodes: known.map((id) => ({ identifier: id, description: descriptions[id] })) } });
  };
  return { call, asked };
}
