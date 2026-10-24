import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import type { RouterClient } from '@orpc/server';
import { createTanstackQueryUtils } from '@orpc/tanstack-query';
import type { ConsoleRouter } from '../build-console-router.ts';
import { SESSION_HEADER } from '../console-auth/session-header.ts';

export type ConsoleAPI = ReturnType<typeof createConsoleAPI>;

// The page's typed handle on hq's console API, as TanStack Query options. Each call carries the
// session readSession gives at that moment.
export function createConsoleAPI(readSession: () => string) {
  // Read at each call, not at creation: a page reached on a new origin (a test's new server) calls it.
  const client: RouterClient<ConsoleRouter> = createORPCClient(new RPCLink({ url: () => `${globalThis.location.origin}/rpc`, headers: () => ({ [SESSION_HEADER]: readSession() }) }));
  return createTanstackQueryUtils(client);
}
