import type { Database } from 'bun:sqlite';
import type { Server } from 'bun';
import { RPCHandler } from '@orpc/server/fetch';
import { buildConsoleRouter } from './build-console-router.ts';
import { checkConsoleRequest } from './check-console-request.ts';
import type { ConsoleAssets } from './load-console-assets.ts';
import type { Runner } from './runner/types.ts';
import type { ShippedPeriod, ShippedReport } from './shipped/types.ts';

export interface ConsoleServerInput {
  db: Database;
  port: number;
  actor: string;
  run: Runner;
  assets: ConsoleAssets;
  notify: () => Promise<boolean>;
  loadShipped: (period: ShippedPeriod) => Promise<ShippedReport>;
}

// Serves the page and its API on 127.0.0.1 only. Every request, page files included, passes the
// Host and Origin check first; `/rpc` goes to the oRPC router, any other path to the page's files.
// No response may load in another site's frame, so a decoy page cannot steer the owner's clicks.
export function createConsoleServer(input: ConsoleServerInput): Server<undefined> {
  const context = { db: input.db, actor: input.actor, run: input.run, notify: input.notify, loadShipped: input.loadShipped },
    handler = new RPCHandler(buildConsoleRouter());
  return Bun.serve({
    hostname: '127.0.0.1',
    port: input.port,
    async fetch(req, server) {
      if (!checkConsoleRequest(req, server.port ?? input.port)) {
        return applyFrameGuard(new Response('hq console: this request does not come from the console page\n', { status: 403 }));
      }
      const result = await handler.handle(req, { prefix: '/rpc', context });
      if (result.matched) {
        return applyFrameGuard(result.response);
      }
      return applyFrameGuard(buildAssetResponse(input.assets, req));
    },
  });
}

// The Shipped tab's path loads the same page, whose router shows the tab.
function buildAssetResponse(assets: ConsoleAssets, req: Request): Response {
  const asked = new URL(req.url).pathname,
    page = asked === '/shipped' ? '/' : asked,
    served = assets.get(page);
  if (served === undefined) {
    return new Response('not found\n', { status: 404 });
  }
  return served();
}

function applyFrameGuard(response: Response): Response {
  const guarded = new Response(response.body, response);
  guarded.headers.set('x-frame-options', 'DENY');
  guarded.headers.set('content-security-policy', "frame-ancestors 'none'");
  return guarded;
}
