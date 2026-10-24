import { expect, onTestFinished, test } from 'bun:test';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { askConsoleLogin } from './ask-console-login.ts';
import { serveConsoleControl } from './serve-console-control.ts';

async function setupTest(onLogin: () => string) {
  const directory = mkdtempSync(join(tmpdir(), 'hq-console-control-'));
  const path = join(directory, 'run', 'hq-console.sock');
  const control = await serveConsoleControl(path, onLogin);
  onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
  onTestFinished(control.stop);
  return { path, control };
}

test('a login request reaches the running console, whose reply holds no link, on a socket only its uid opens', async () => {
  let asked = 0;
  const app = await setupTest(() => {
    asked += 1;
    return 'printed';
  });

  const replies = [await askConsoleLogin(app.path), await askConsoleLogin(app.path)];

  expect(replies).toStrictEqual(['printed', 'printed']);
  expect(asked).toBe(2);
  expect(statSync(app.path).mode & 0o777).toBe(0o600);
  expect(statSync(join(app.path, '..')).mode & 0o777).toBe(0o700);
});

test('a second console refuses to take over the socket of one that still answers', async () => {
  const app = await setupTest(() => 'printed');

  await expect(serveConsoleControl(app.path, () => 'printed')).rejects.toThrow('another hq console already answers');
  await expect(askConsoleLogin(app.path)).resolves.toBe('printed');
});

test('with no console running, login names how to start one', async () => {
  const app = await setupTest(() => 'unused');
  app.control.stop();

  await expect(askConsoleLogin(app.path)).rejects.toThrow('start it with hq console in your own terminal');
});
