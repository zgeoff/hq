import { expect, test } from 'bun:test';
import { parseReleases } from './parse-releases.ts';

test('it rejects a release row that is an array as not an object', () => {
  expect(() => parseReleases([['v1.0.0', '2026-10-10T00:00:00Z']], /^v\d/u)).toThrow(/a release row is not an object/u);
});
