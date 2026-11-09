import type { UsageSample } from '../../capacity/usage-sample.ts';

export function buildMockUsageSample(overrides: Partial<UsageSample> = {}): UsageSample {
  return { at: '2026-10-14T00:00:00Z', account: 'abcdef012345', five_hour: 0, seven_day: 0, five_hour_resets_at: null, seven_day_resets_at: null, ...overrides };
}
