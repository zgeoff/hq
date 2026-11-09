import { expect, test } from 'bun:test';
import { isAsleepSession } from './is-asleep-session.ts';
import type { AwakeSession } from './types.ts';

test.each<[string, AwakeSession, boolean]>([
  ['alive, no lifecycle', { id: 'a', alive: true }, false],
  ['alive, desired sleep', { id: 'a', alive: true, lifecycle: { desired: 'sleep' } }, false],
  ['not alive, vm asleep', { id: 'a', alive: false, lifecycle: { vm: 'asleep' } }, true],
  ['not alive, harness suspended', { id: 'a', alive: false, lifecycle: { harness: 'suspended' } }, true],
  ['not alive, desired sleep', { id: 'a', alive: false, lifecycle: { desired: 'sleep' } }, true],
  ['not alive, exited and stopped', { id: 'a', alive: false, lifecycle: { harness: 'exited', desired: 'stop' } }, false],
  ['not alive, no lifecycle', { id: 'a', alive: false }, false],
])('it reads a session that is %s as asleep: %p', (_name, session, expected) => {
  expect(isAsleepSession(session)).toBe(expected);
});
