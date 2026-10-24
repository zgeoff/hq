import { expect, test } from 'bun:test';
import { readTabSession } from './read-tab-session.ts';

test('it reads the tab session, and gives an empty session when there is none or storage is blocked', () => {
  expect(readTabSession(() => 'kettle-session')).toBe('kettle-session');
  expect(readTabSession(() => null)).toBe('');
  expect(
    readTabSession(() => {
      throw new Error('SecurityError: storage is blocked');
    }),
  ).toBe('');
});
