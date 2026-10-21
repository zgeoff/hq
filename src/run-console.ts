import type { Database } from 'bun:sqlite';
import { createConsoleServer } from './create-console-server.ts';
import { loadConsoleAssets } from './load-console-assets.ts';
import { makeAuditedLinearCaller } from './linear/make-audited-linear-caller.ts';
import { DEFS } from './prompts/defs.ts';
import { boundedRunner } from './runner/bounded-runner.ts';
import { realRunner } from './runner/real-runner.ts';
import { sendConsoleMessages } from './send-console-messages.ts';
import { makeShippedLoader } from './shipped/make-shipped-loader.ts';
import { CALL_MS } from './watcher/call-ms.ts';

const DEFAULT_PORT = 4317;

// `hq console [--port N]`: serves the console in the foreground until it is stopped.
export async function runConsole(db: Database, port: number | null): Promise<never> {
  const assets = await loadConsoleAssets(),
    // oxlint-disable-next-line new-cap -- DEFS is the definitions folder's accessor, called as every module calls it
    loadShipped = makeShippedLoader({ db, run: realRunner, call: makeAuditedLinearCaller(db, realRunner), scripts: `${DEFS()}/skills/delivery-report/scripts` }),
    server = createConsoleServer({ db, port: port ?? DEFAULT_PORT, actor: 'console', run: boundedRunner(realRunner, CALL_MS), assets, notify: () => sendConsoleMessages(db), loadShipped });
  console.log(`hq console: http://127.0.0.1:${server.port}/  (Ctrl-C stops it)`);
  return await new Promise<never>(() => {});
}
