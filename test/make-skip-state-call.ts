import type { LinearCall } from '../src/linear/types.ts';
import { buildReadyPage } from './build-ready-page.ts';
import type { ReadyNodeSeed } from './build-ready-page.ts';

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
