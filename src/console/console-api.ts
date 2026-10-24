import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import type { RouterClient } from '@orpc/server';
import { createTanstackQueryUtils } from '@orpc/tanstack-query';
import type { ConsoleRouter } from '../build-console-router.ts';
import { SESSION_HEADER } from '../console-auth/session-header.ts';
import { SESSION_STORAGE_KEY } from './session-storage-key.ts';

// The page's typed handle on hq's console API, as TanStack Query options.
export const consoleAPI = createTanstackQueryUtils(buildClient());

function buildClient(): RouterClient<ConsoleRouter> {
  // Read at each call, not at import: a page reached on a new origin (a test's new server) calls it.
  return createORPCClient(new RPCLink({ url: () => `${globalThis.location.origin}/rpc`, headers: () => ({ [SESSION_HEADER]: readSession() }) }));
}

function readSession(): string {
  try {
    return globalThis.sessionStorage.getItem(SESSION_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}
