import type { LinearCall } from '../src/linear/types.ts';

// Answers the team's issue labels, or an outage for them, and leaves every other query to the call it wraps.
export function makeLabelsCall(inner: LinearCall, labels: string[] | 'outage'): LinearCall {
  return (query, variables) => {
    if (!query.includes('issueLabels')) {
      return inner(query, variables);
    }
    if (labels === 'outage') {
      return Promise.reject(new Error('Linear answered 502: invented labels outage'));
    }
    const nodes = labels.map((name) => ({ name, isGroup: false, parent: null }));
    return Promise.resolve({ issueLabels: { nodes, pageInfo: { hasNextPage: false, endCursor: null } } });
  };
}
