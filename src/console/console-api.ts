import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import type { RouterClient } from '@orpc/server';
import { createTanstackQueryUtils } from '@orpc/tanstack-query';
import type { ConsoleRouter } from '../build-console-router.ts';

// The page's typed handle on hq's console API, as TanStack Query options.
export const consoleAPI = createTanstackQueryUtils(buildClient());

function buildClient(): RouterClient<ConsoleRouter> {
  // Read at each call, not at import: a page reached on a new origin (a test's new server) calls it.
  return createORPCClient(new RPCLink({ url: () => `${globalThis.location.origin}/rpc` }));
}
