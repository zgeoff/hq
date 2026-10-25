import { expect, test } from 'bun:test';
import { collectAccountSeries } from './collect-account-series.ts';

test('it splits the samples into one series per account, each in its own order', () => {
  const series = collectAccountSeries([
    { at: '2026-10-14T01:00:00Z', account: 'kettle01', five_hour: 1, seven_day: 10, five_hour_resets_at: null, seven_day_resets_at: null },
    { at: '2026-10-14T01:10:00Z', account: 'teapot02', five_hour: 2, seven_day: 50, five_hour_resets_at: null, seven_day_resets_at: null },
    { at: '2026-10-14T01:20:00Z', account: 'kettle01', five_hour: 3, seven_day: 11, five_hour_resets_at: null, seven_day_resets_at: null },
  ]);

  expect(series).toStrictEqual([
    [
      { at: '2026-10-14T01:00:00Z', account: 'kettle01', five_hour: 1, seven_day: 10, five_hour_resets_at: null, seven_day_resets_at: null },
      { at: '2026-10-14T01:20:00Z', account: 'kettle01', five_hour: 3, seven_day: 11, five_hour_resets_at: null, seven_day_resets_at: null },
    ],
    [{ at: '2026-10-14T01:10:00Z', account: 'teapot02', five_hour: 2, seven_day: 50, five_hour_resets_at: null, seven_day_resets_at: null }],
  ]);
});
