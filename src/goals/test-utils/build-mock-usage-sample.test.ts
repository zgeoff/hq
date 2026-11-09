import { expect, test } from 'bun:test';
import { buildMockUsageSample } from './build-mock-usage-sample.ts';

test('it builds a default usage sample', () => {
  expect(buildMockUsageSample()).toStrictEqual({ at: '2026-10-14T00:00:00Z', account: 'abcdef012345', five_hour: 0, seven_day: 0, five_hour_resets_at: null, seven_day_resets_at: null });
});

test('it applies overrides on top of the defaults', () => {
  expect(buildMockUsageSample({ account: 'fedcba543210', seven_day: null })).toStrictEqual({ at: '2026-10-14T00:00:00Z', account: 'fedcba543210', five_hour: 0, seven_day: null, five_hour_resets_at: null, seven_day_resets_at: null });
});
