import { expect, test } from 'bun:test';
import { readLoginGate } from './read-login-gate.ts';

test('a terminal outside every atc session may print a login link', async () => {
  await expect(readLoginGate({ isTTY: true, openClient: () => Promise.resolve({ peerSession: null, close: () => {} }) })).resolves.toStrictEqual({ ok: true });
});

test.each([
  ['output that is not a terminal', false, () => Promise.resolve({ peerSession: null, close: () => {} }), 'its output is not a terminal'],
  ['a terminal inside an atc session', true, () => Promise.resolve({ peerSession: '0000b001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', close: () => {} }), 'it runs inside atc session 0000b001, whose transcript other sessions can read'],
  ['a daemon that names no caller', true, () => Promise.resolve({ peerSession: undefined, close: () => {} }), "atc's hello names no caller session, so this daemon cannot say where it runs"],
  ['no daemon', true, () => Promise.reject(new Error('connect ENOENT')), 'atc could not say where it runs: connect ENOENT'],
])('%s prints no login link', async (_label, isTTY, openClient, reason) => {
  await expect(readLoginGate({ isTTY, openClient })).resolves.toStrictEqual({ ok: false, reason });
});
