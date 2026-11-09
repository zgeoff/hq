import { expect, test } from 'bun:test';
import { buildMockReading } from './build-mock-reading.ts';

test('it builds a reading with a time, no errors and no measurements', () => {
  const reading = buildMockReading();

  expect([reading.at, reading.errors, Object.values(reading).filter((value) => value === null)]).toStrictEqual([
    '2026-10-14T00:55:00Z',
    {},
    Array.from({ length: Object.keys(reading).length - 2 }, () => null),
  ]);
});

test('it applies overrides on top of the defaults', () => {
  expect(buildMockReading({ nonnix_awake_mib: 8192, errors: { cloud: 'timed out' } })).toMatchObject({ at: '2026-10-14T00:55:00Z', nonnix_awake_mib: 8192, nonnix_awake_vcpus: null, errors: { cloud: 'timed out' } });
});
