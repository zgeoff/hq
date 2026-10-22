import { expect, test } from 'bun:test';
import { buildMockLaneConfig } from './build-mock-lane-config.ts';

test('it defaults to one local slot that lends, and takes overrides', () => {
  expect(buildMockLaneConfig('atc')).toStrictEqual({ name: 'atc', place: 'local', size: 1, lends: true });
  expect(buildMockLaneConfig('cleanup', { place: 'imp', size: 3, lends: false })).toStrictEqual({ name: 'cleanup', place: 'imp', size: 3, lends: false });
});
