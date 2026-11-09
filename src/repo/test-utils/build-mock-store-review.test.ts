import { expect, test } from 'bun:test';
import { buildMockStoreReview } from './build-mock-store-review.ts';

test('it builds a default standard review of a PR head', () => {
  expect(buildMockStoreReview()).toStrictEqual({
    review_id: 'r1',
    repo: 'zgeoff/widgets',
    pull_request: 7,
    base: 'main',
    head: 'feat',
    depth: 'standard',
    risk_classes: '[]',
    lenses: '[]',
    config_hash: 'c1',
    started_at: '2026-10-01T00:00:00Z',
    ended_at: '2026-10-01T00:01:00Z',
  });
});

test('it applies overrides on top of the defaults', () => {
  expect(buildMockStoreReview({ review_id: 'r0', head: 'h2' })).toMatchObject({ review_id: 'r0', head: 'h2', repo: 'zgeoff/widgets' });
});
