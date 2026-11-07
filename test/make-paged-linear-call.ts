import type { LinearCall } from '../src/linear/types.ts';

export function makePagedLinearCall(pages: readonly (readonly unknown[])[], queries: string[]): LinearCall {
  return (query, variables) => {
    queries.push(query);
    const index = pickPageIndex(variables['after']);
    const nodes = pages[index];
    if (nodes === undefined) {
      return Promise.reject(new Error(`no page ${index} in a ${pages.length}-page stand-in`));
    }
    const last = index === pages.length - 1;
    return Promise.resolve({ issues: { nodes, pageInfo: { hasNextPage: !last, endCursor: last ? null : `page-${index + 1}` } } });
  };
}

function pickPageIndex(after: unknown): number {
  return typeof after === 'string' ? Number(after.replace('page-', '')) : 0;
}
