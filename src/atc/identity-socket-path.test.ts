import { expect, onTestFinished, test } from 'bun:test';
import { userInfo } from 'node:os';
import { overrideEnv } from '../config/override-env.ts';
import { identitySocketPath } from './identity-socket-path.ts';

test('a test never reaches a live daemon, and HQ_ATC_SOCKET does not move the check', () => {
  onTestFinished(overrideEnv('HQ_ATC_SOCKET', '/tmp/forged-kettle.sock'));

  expect(identitySocketPath()).toBe('/nonexistent/hq-test-no-live-atc.sock');
});

test("outside a test it takes the uid's own socket, whatever HQ_ATC_SOCKET, HOME and XDG_RUNTIME_DIR say", () => {
  onTestFinished(overrideEnv('NODE_ENV', undefined));
  onTestFinished(overrideEnv('HQ_ATC_SOCKET', '/tmp/forged-kettle.sock'));
  onTestFinished(overrideEnv('HOME', '/tmp/forged-home'));
  const savedRuntime = process.env['XDG_RUNTIME_DIR'];
  process.env['XDG_RUNTIME_DIR'] = '/tmp/forged-runtime';
  onTestFinished(() => {
    if (savedRuntime === undefined) {
      delete process.env['XDG_RUNTIME_DIR'];
    } else {
      process.env['XDG_RUNTIME_DIR'] = savedRuntime;
    }
  });

  expect([`/run/user/${process.getuid?.()}/atc-daemon.sock`, `${userInfo().homedir}/.local/state/atc/atc-daemon.sock`]).toContain(identitySocketPath());
});
