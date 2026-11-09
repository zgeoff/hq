import { expect, test } from 'bun:test';
import { buildMockStoreDisposition } from './build-mock-store-disposition.ts';

test('it builds a default fixed disposition on the first PR', () => {
  expect(buildMockStoreDisposition()).toStrictEqual({ repo: 'zgeoff/hq', finding_id: 'f1', kind: 'fixed', value: 'x', author: 'a', author_is_owner: 1, source: 's', at: '2026-10-01T00:00:00Z', pull_request: 1 });
});

test('it applies overrides on top of the defaults', () => {
  expect(buildMockStoreDisposition({ pull_request: 2, source: 'review-2' })).toMatchObject({ pull_request: 2, source: 'review-2', repo: 'zgeoff/hq' });
});
