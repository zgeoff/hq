import { expect, test } from 'bun:test';
import { buildStubPRHead } from './build-stub-pr-head.ts';

test('it answers the gate facts and the head read with the same head', () => {
  const stub = buildStubPRHead('a1b2c3d4e5f60718293a4b5c6d7e8f9012345678');

  expect(JSON.parse(stub.prFacts?.stdout ?? '')).toMatchObject({ headRefOid: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678', author: { login: 'zgeoff', is_bot: false } });
  expect(JSON.parse(stub.prHead?.stdout ?? '')).toStrictEqual({ headRefOid: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678' });
});

test('it gives the author a bot flag when asked', () => {
  const stub = buildStubPRHead('a1b2c3d4e5f60718293a4b5c6d7e8f9012345678', { login: 'renovate', is_bot: true });

  expect(JSON.parse(stub.prFacts?.stdout ?? '')).toMatchObject({ author: { login: 'renovate', is_bot: true } });
});
