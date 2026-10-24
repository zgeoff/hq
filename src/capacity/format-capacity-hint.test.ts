import { expect, test } from 'bun:test';
import { buildCapacityHint } from './build-capacity-hint.ts';
import { formatCapacityHint } from './format-capacity-hint.ts';

test('it prints each window with its sample count and both projections', () => {
  const hint = buildCapacityHint({
    samples: [
      { at: '2026-10-14T01:00:00Z', account: 'kettle01', five_hour: 10, seven_day: 10, five_hour_resets_at: null, seven_day_resets_at: null },
      { at: '2026-10-14T01:30:00Z', account: 'kettle01', five_hour: 12, seven_day: 12, five_hour_resets_at: null, seven_day_resets_at: null },
      { at: '2026-10-14T02:00:00Z', account: 'kettle01', five_hour: 14, seven_day: 14, five_hour_resets_at: null, seven_day_resets_at: null },
    ],
    hours: 2,
    limit: 95,
    working: 2,
    cap: 4,
    at: new Date('2026-10-14T02:00:00Z'),
  });

  expect(formatCapacityHint(hint)).toStrictEqual([
    'Claude burn, last 2 h, account kettle01:',
    "  7-day, last 2 h, 3 samples: 14.0% now, +4.00%/h (least-squares); at today's rate 95% in 20.3 h (2026-10-14T22:15:00Z); at the cap of 4 (+8.00%/h) 95% in 10.1 h (2026-10-14T12:07:30Z)",
    "  5-hour, last 2 h, 3 samples: 14.0% now, +4.00%/h (least-squares); at today's rate 95% in 20.3 h (2026-10-14T22:15:00Z); at the cap of 4 (+8.00%/h) 95% in 10.1 h (2026-10-14T12:07:30Z)",
    '  working sessions: 2 (current count, no history)',
  ]);
});

test('it names the time the fit starts from when a window reset cut the earlier samples', () => {
  const hint = buildCapacityHint({
    samples: [
      { at: '2026-10-14T00:30:00Z', account: 'kettle01', five_hour: 88, seven_day: 10, five_hour_resets_at: '2026-10-14T01:00:00Z', seven_day_resets_at: null },
      { at: '2026-10-14T01:00:00Z', account: 'kettle01', five_hour: 2, seven_day: 11, five_hour_resets_at: '2026-10-14T06:00:00Z', seven_day_resets_at: null },
      { at: '2026-10-14T01:30:00Z', account: 'kettle01', five_hour: 4, seven_day: 12, five_hour_resets_at: '2026-10-14T06:00:00Z', seven_day_resets_at: null },
      { at: '2026-10-14T02:00:00Z', account: 'kettle01', five_hour: 6, seven_day: 13, five_hour_resets_at: '2026-10-14T06:00:00Z', seven_day_resets_at: null },
    ],
    hours: 2,
    limit: 95,
    working: 0,
    cap: null,
    at: new Date('2026-10-14T02:00:00Z'),
  });

  expect(formatCapacityHint(hint)).toStrictEqual([
    'Claude burn, last 2 h, account kettle01:',
    "  7-day, last 2 h, 4 samples: 13.0% now, +2.00%/h (least-squares); at today's rate 95% in 41.0 h (2026-10-15T19:00:00Z)",
    "  5-hour, since 01:00Z (window reset), 3 samples: 6.0% now, +4.00%/h (least-squares); at today's rate 95% in 22.3 h (2026-10-15T00:15:00Z)",
    '  working sessions: 0 (current count, no history)',
  ]);
});

test('it prints too few samples for a window with fewer than 3', () => {
  const hint = buildCapacityHint({
    samples: [
      { at: '2026-10-14T01:30:00Z', account: 'kettle01', five_hour: 12, seven_day: 12, five_hour_resets_at: null, seven_day_resets_at: null },
      { at: '2026-10-14T02:00:00Z', account: 'kettle01', five_hour: 14, seven_day: 14, five_hour_resets_at: null, seven_day_resets_at: null },
    ],
    hours: 2,
    limit: 95,
    working: 0,
    cap: null,
    at: new Date('2026-10-14T02:00:00Z'),
  });

  expect(formatCapacityHint(hint)).toStrictEqual([
    'Claude burn, last 2 h, account kettle01:',
    '  7-day, last 2 h, 2 samples: too few samples',
    '  5-hour, last 2 h, 2 samples: too few samples',
    '  working sessions: 0 (current count, no history)',
  ]);
});
