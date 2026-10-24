import type { LinearCall } from '../src/linear/types.ts';

interface HeldLinearCall {
  call: LinearCall;
  ready: PromiseWithResolvers<unknown>;
  backlog: PromiseWithResolvers<unknown>;
  backlogAsked: Promise<void>;
}

export function buildHeldLinearCall(): HeldLinearCall {
  const ready = Promise.withResolvers<unknown>();
  const backlog = Promise.withResolvers<unknown>();
  const asked = Promise.withResolvers<void>();
  const call: LinearCall = (_query, variables) => {
    if (variables['state'] !== 'Backlog') {
      return ready.promise;
    }
    asked.resolve();
    return backlog.promise;
  };
  return { call, ready, backlog, backlogAsked: asked.promise };
}
