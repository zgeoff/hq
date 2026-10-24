import { expect, test } from 'bun:test';
import { createConsoleAuth } from './create-console-auth.ts';

test('a login token swaps once for a session, and only that session passes', () => {
  const auth = createConsoleAuth();
  const token = auth.mintLogin();

  const session = auth.exchange(token);

  expect(session).toMatch(/^[\w-]{43}$/u);
  expect(auth.exchange(token)).toBeNull();
  expect(auth.hasSession(session)).toBe(true);
  expect(auth.hasSession('invented-kettle-session')).toBe(false);
  expect(auth.hasSession(null)).toBe(false);
});

test('a new login token replaces the last, and a wrong one gets nothing', () => {
  const auth = createConsoleAuth();
  const first = auth.mintLogin();
  const second = auth.mintLogin();

  expect(auth.exchange(first)).toBeNull();
  expect(auth.exchange('invented-kettle-token')).toBeNull();
  expect(auth.exchange(second)).not.toBeNull();
});
