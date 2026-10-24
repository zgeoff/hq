import { expect, onTestFinished, test } from 'bun:test';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { askConsoleLogin } from './ask-console-login.ts';
import type { ControlReply } from './control-protocol.ts';
import { serveConsoleControl } from './serve-console-control.ts';

async function setupTest(onLogin: () => ControlReply) {
  const directory = mkdtempSync(join(tmpdir(), 'hq-console-control-'));
  const path = join(directory, 'run', 'hq-console.sock');
  onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
  const control = await serveConsoleControl(path, onLogin);
  onTestFinished(control.stop);
  return { path, control };
}

test('a login request reaches the running console, whose reply holds no link, on a socket only its uid opens', async () => {
  let asked = 0;
  const app = await setupTest(() => {
    asked += 1;
    return { status: 'printed' };
  });

  const replies = [await askConsoleLogin(app.path), await askConsoleLogin(app.path)];

  expect(replies).toStrictEqual([{ status: 'printed' }, { status: 'printed' }]);
  expect(asked).toBe(2);
  expect(statSync(app.path).mode & 0o777).toBe(0o600);
  expect(statSync(join(app.path, '..')).mode & 0o777).toBe(0o700);
});

test('a second console refuses to take over the socket of one that still answers', async () => {
  const app = await setupTest(() => ({ status: 'printed' }));

  await expect(serveConsoleControl(app.path, () => ({ status: 'printed' }))).rejects.toThrow('another hq console already answers');
  await expect(askConsoleLogin(app.path)).resolves.toStrictEqual({ status: 'printed' });
});

test('with no console running, login names how to start one', async () => {
  const app = await setupTest(() => ({ status: 'unknown-request' }));
  app.control.stop();

  await expect(askConsoleLogin(app.path)).rejects.toThrow('start it with hq console in your own terminal');
});

test('a request other than login gets the unknown-request reply, not a link', async () => {
  const app = await setupTest(() => ({ status: 'printed' }));
  const closed = Promise.withResolvers<string>();
  let answer = '';

  await Bun.connect({ unix: app.path, socket: { open: (socket) => void socket.write('show-link\n'), data: (_socket, chunk) => void (answer += Buffer.from(chunk).toString('utf8')), close: () => closed.resolve(answer) } });

  await expect(closed.promise).resolves.toBe('{"status":"unknown-request"}\n');
});
