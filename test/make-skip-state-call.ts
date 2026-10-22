import type { LinearCall } from '../src/linear/types.ts';
import { buildReadyPage } from './build-ready-page.ts';
import type { ReadyNodeSeed } from './build-ready-page.ts';

// Linear holding these Ready issues on one page, and answering the issue-state query by `ids` with
// each asked issue's state type from `states` (an issue missing there is not in Linear). An Error for
// `states` rejects the state query only, as a failed request does.
export function makeSkipStateCall(ready: ReadyNodeSeed[], states: Record<string, string> | Error): LinearCall {
  return (_query, variables) => {
    const ids = variables['ids'];
    if (!Array.isArray(ids)) {
      return Promise.resolve(buildReadyPage(ready, null));
    }
    if (states instanceof Error) {
      return Promise.reject(states);
    }
    const nodes = ids.filter((id) => typeof id === 'string' && id in states).map((id: string) => ({ identifier: id, previousIdentifiers: [], state: { type: states[id] } }));
    return Promise.resolve({ issues: { nodes } });
  };
}
