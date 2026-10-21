import { expect, test } from 'bun:test';
import { buildMockRelease } from './build-mock-release.ts';

test('it builds a published release', () => {
  expect(buildMockRelease('v1.0.0', '2026-10-15T00:00:00Z')).toStrictEqual({ tag_name: 'v1.0.0', draft: false, prerelease: false, published_at: '2026-10-15T00:00:00Z' });
});

test('it lets extra fields turn a release into a prerelease', () => {
  expect(buildMockRelease('v1.0.0', '2026-10-15T00:00:00Z', { prerelease: true })).toMatchObject({ prerelease: true });
});
