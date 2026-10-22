import { expect, test } from 'bun:test';
import { buildMockLaneConfig } from './build-mock-lane-config.ts';

test('it defaults to one local slot, and takes overrides', () => {
  expect(buildMockLaneConfig('atc')).toStrictEqual({ name: 'atc', place: 'local', size: 1 });
  expect(buildMockLaneConfig('cleanup', { place: 'imp', size: 3 })).toStrictEqual({ name: 'cleanup', place: 'imp', size: 3 });
});
