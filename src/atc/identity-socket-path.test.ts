import { expect, onTestFinished, test } from 'bun:test';
import { overrideEnv } from '../config/override-env.ts';
import { identitySocketPath } from './identity-socket-path.ts';

test.each([
  ['the runtime dir when the uid has one', { inTest: false, uid: 1042, homedir: '/home/kettle', runtimeDirExists: true }, '/run/user/1042/atc-daemon.sock'],
  ["the uid's state dir when it has none", { inTest: false, uid: 1042, homedir: '/home/kettle', runtimeDirExists: false }, '/home/kettle/.local/state/atc/atc-daemon.sock'],
  ['a socket that is never there in a test', { inTest: true, uid: 1042, homedir: '/home/kettle', runtimeDirExists: true }, '/nonexistent/hq-test-no-live-atc.sock'],
])('it takes %s', (_case, host, path) => {
  expect(identitySocketPath(host)).toBe(path);
});

test('HQ_ATC_SOCKET and HOME do not move the check', () => {
  onTestFinished(overrideEnv('HQ_ATC_SOCKET', '/tmp/forged-kettle.sock'));
  onTestFinished(overrideEnv('HOME', '/tmp/forged-home'));

  expect(identitySocketPath({ inTest: false, uid: 1042, homedir: '/home/kettle', runtimeDirExists: false })).toBe('/home/kettle/.local/state/atc/atc-daemon.sock');
});
