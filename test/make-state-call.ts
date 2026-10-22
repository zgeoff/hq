import type { LinearCall } from '../src/linear/types.ts';
import { buildReadyPage } from './build-ready-page.ts';
import type { ReadyNodeSeed } from './build-ready-page.ts';

// Linear holding these Ready issues and these issues in any other state, one page each.
export function makeStateCall(ready: ReadyNodeSeed[], other: ReadyNodeSeed[]): LinearCall {
  return (_query, variables) => {
    const seeds = variables['state'] === 'Ready' ? ready : other;
    return Promise.resolve(buildReadyPage(seeds, null));
  };
}
