import type { Database } from 'bun:sqlite';
import { createConsoleAuth } from './console-auth/create-console-auth.ts';
import { controlSocketPath } from './console-auth/control-socket-path.ts';
import type { LoginGateDeps } from './console-auth/read-login-gate.ts';
import { startConsoleLogin } from './console-auth/start-console-login.ts';
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

// `hq console [--port N]`: serves the console in the foreground until it is stopped. The login
// link goes only to the owner's own terminal; `hq console login` asks this process to print another there.
export async function runConsole(db: Database, port: number | null, gateDeps: LoginGateDeps): Promise<never> {
  const assets = await loadConsoleAssets(),
    auth = createConsoleAuth(),
    // oxlint-disable-next-line new-cap -- DEFS is the definitions folder's accessor, called as every module calls it
    loadShipped = makeShippedLoader({ db, run: realRunner, call: makeAuditedLinearCaller(db, realRunner), scripts: `${DEFS()}/skills/delivery-report/scripts` }),
    server = createConsoleServer({ db, port: port ?? DEFAULT_PORT, actor: 'console', run: boundedRunner(realRunner, CALL_MS), assets, notify: () => sendConsoleMessages(db), loadShipped, auth }),
    controlPath = controlSocketPath();
  await startConsoleLogin({ port: server.port ?? DEFAULT_PORT, auth, gateDeps, controlPath, print: (line) => console.log(line) });
  return await new Promise<never>(() => {});
}
