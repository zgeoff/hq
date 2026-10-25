import { expect, test } from 'bun:test';
import { buildLanePoints } from './build-lane-points.ts';

test('it fits each account apart within a gap between slot reads and keeps a point for each', () => {
  const points = buildLanePoints(
    [
      { at: '2026-10-14T00:00:00Z', slot: 1, status: '200', five: 1, fiveResetsAt: null, seven: 10, sevenResetsAt: '2026-10-18T00:00:00Z', workingLanes: 3 },
      { at: '2026-10-14T02:00:00Z', slot: 1, status: '200', five: 1, fiveResetsAt: null, seven: 12, sevenResetsAt: '2026-10-18T00:00:00Z', workingLanes: 2 },
    ],
    [
      { at: '2026-10-14T00:00:00Z', account: 'kettle01', five_hour: 1, seven_day: 10, five_hour_resets_at: null, seven_day_resets_at: '2026-10-18T00:00:00Z' },
      { at: '2026-10-14T00:15:00Z', account: 'kettle01', five_hour: 1, seven_day: 10.5, five_hour_resets_at: null, seven_day_resets_at: '2026-10-18T00:00:00Z' },
      { at: '2026-10-14T00:30:00Z', account: 'kettle01', five_hour: 1, seven_day: 11, five_hour_resets_at: null, seven_day_resets_at: '2026-10-18T00:00:00Z' },
      { at: '2026-10-14T01:00:00Z', account: 'teapot02', five_hour: 1, seven_day: 60, five_hour_resets_at: null, seven_day_resets_at: '2026-10-19T00:00:00Z' },
      { at: '2026-10-14T01:30:00Z', account: 'teapot02', five_hour: 1, seven_day: 61, five_hour_resets_at: null, seven_day_resets_at: '2026-10-19T00:00:00Z' },
      { at: '2026-10-14T02:00:00Z', account: 'teapot02', five_hour: 1, seven_day: 62, five_hour_resets_at: null, seven_day_resets_at: '2026-10-19T00:00:00Z' },
    ],
  );

  expect(points).toStrictEqual([
    { lanes: 3, rate: 2 },
    { lanes: 3, rate: 2 },
  ]);
});
