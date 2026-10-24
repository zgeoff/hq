import { expect, onTestFinished, spyOn, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { freshDb } from '../../test/helpers.ts';
import { createConsoleServer } from '../create-console-server.ts';
import { askConsoleLogin } from './ask-console-login.ts';
import { createConsoleAuth } from './create-console-auth.ts';
import { startConsoleLogin } from './start-console-login.ts';

// A real console server and its login wiring, started from a terminal that is `isTTY` and outside
// every atc session.
async function setupTest(isTTY: boolean) {
  const directory = mkdtempSync(join(tmpdir(), 'hq-console-login-'));
  onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  const spy = spyOn(console, 'log').mockImplementation(() => {});
  onTestFinished(() => spy.mockRestore());
  const auth = createConsoleAuth();
  const server = createConsoleServer({ db: fresh.db, auth, port: 0, actor: 'console', run: () => Promise.resolve({ code: 1, stdout: '', stderr: 'no gh in this test' }), assets: new Map(), notify: () => Promise.resolve(true), loadShipped: () => Promise.reject(new Error('no report in this test')) });
  onTestFinished(() => server.stop(true));
  const printed: string[] = [];
  const controlPath = join(directory, 'hq-console.sock');
  const login = await startConsoleLogin({ port: server.port ?? 0, auth, gateDeps: { isTTY, openClient: () => Promise.resolve({ peerSession: null, close: () => {} }) }, controlPath, print: (line) => printed.push(line) });
  onTestFinished(login.stop);
  const exchange = (token: string) => fetch(`http://127.0.0.1:${server.port}/auth/exchange`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }) });
  const tokenAt = (index: number) => /#t=(?<token>[\w-]+)/u.exec(printed[index] ?? '')?.groups?.['token'] ?? '';
  return { printed, controlPath, exchange, tokenAt };
}

test("the owner's terminal gets a link that signs in to this console, and a login request prints another there", async () => {
  const app = await setupTest(true);

  const first = await app.exchange(app.tokenAt(0));
  const reply = await askConsoleLogin(app.controlPath);
  const second = await app.exchange(app.tokenAt(1));

  expect([first.status, second.status]).toStrictEqual([200, 200]);
  expect(reply).toStrictEqual({ status: 'printed' });
});

test('a console started off a terminal prints no link, and a login request is refused and prints none', async () => {
  const app = await setupTest(false);

  const reply = await askConsoleLogin(app.controlPath);

  expect(app.printed).toHaveLength(1);
  expect(app.printed[0]).not.toContain('#t=');
  expect(reply).toStrictEqual({ status: 'refused', reason: 'its output is not a terminal' });
});
