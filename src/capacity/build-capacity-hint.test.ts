import { expect, test } from 'bun:test';
import { buildCapacityHint } from './build-capacity-hint.ts';

test('it projects the time to the limit at today rate and at the cap', () => {
  const hint = buildCapacityHint({ samples: [{ at: '2026-10-14T01:00:00Z', account: 'kettle01', five_hour: null, seven_day: 10, five_hour_resets_at: null, seven_day_resets_at: null }, { at: '2026-10-14T01:30:00Z', account: 'kettle01', five_hour: null, seven_day: 12, five_hour_resets_at: null, seven_day_resets_at: null }, { at: '2026-10-14T02:00:00Z', account: 'kettle01', five_hour: null, seven_day: 14, five_hour_resets_at: null, seven_day_resets_at: null }, { at: '2026-10-14T02:30:00Z', account: 'kettle01', five_hour: null, seven_day: 16, five_hour_resets_at: null, seven_day_resets_at: null }], hours: 2, limit: 95, working: 2, cap: 4, at: new Date('2026-10-14T02:30:00Z') });

  expect(hint.windows[0]).toStrictEqual({
    window: '7-day',
    method: 'least-squares',
    samples: 4,
    latest: 16,
    ratePerHour: 4,
    since: '2026-10-14T01:00:00Z',
    atRate: { kind: 'in', hours: 19.75, at: '2026-10-14T22:15:00Z' },
    atCap: { kind: 'in', hours: 9.875, at: '2026-10-14T12:22:30Z', ratePerHour: 8 },
  });
});

test('it leaves the projection at the cap out with no cap', () => {
  const hint = buildCapacityHint({ samples: [{ at: '2026-10-14T01:00:00Z', account: 'kettle01', five_hour: null, seven_day: 10, five_hour_resets_at: null, seven_day_resets_at: null }, { at: '2026-10-14T01:30:00Z', account: 'kettle01', five_hour: null, seven_day: 12, five_hour_resets_at: null, seven_day_resets_at: null }, { at: '2026-10-14T02:00:00Z', account: 'kettle01', five_hour: null, seven_day: 14, five_hour_resets_at: null, seven_day_resets_at: null }, { at: '2026-10-14T02:30:00Z', account: 'kettle01', five_hour: null, seven_day: 16, five_hour_resets_at: null, seven_day_resets_at: null }], hours: 2, limit: 95, working: 2, cap: null, at: new Date('2026-10-14T02:30:00Z') });

  expect(hint.windows[0]?.atCap).toBeNull();
});

test('it leaves the projection at the cap out with no working session', () => {
  const hint = buildCapacityHint({ samples: [{ at: '2026-10-14T01:00:00Z', account: 'kettle01', five_hour: null, seven_day: 10, five_hour_resets_at: null, seven_day_resets_at: null }, { at: '2026-10-14T01:30:00Z', account: 'kettle01', five_hour: null, seven_day: 12, five_hour_resets_at: null, seven_day_resets_at: null }, { at: '2026-10-14T02:00:00Z', account: 'kettle01', five_hour: null, seven_day: 14, five_hour_resets_at: null, seven_day_resets_at: null }, { at: '2026-10-14T02:30:00Z', account: 'kettle01', five_hour: null, seven_day: 16, five_hour_resets_at: null, seven_day_resets_at: null }], hours: 2, limit: 95, working: 0, cap: 4, at: new Date('2026-10-14T02:30:00Z') });

  expect(hint.windows[0]?.atRate?.kind).toBe('in');
  expect(hint.windows[0]?.atCap).toBeNull();
});

test('it says the limit is reached when the window is at it', () => {
  const hint = buildCapacityHint({ samples: [{ at: '2026-10-14T01:00:00Z', account: 'kettle01', five_hour: null, seven_day: 96, five_hour_resets_at: null, seven_day_resets_at: null }, { at: '2026-10-14T01:30:00Z', account: 'kettle01', five_hour: null, seven_day: 96, five_hour_resets_at: null, seven_day_resets_at: null }, { at: '2026-10-14T02:00:00Z', account: 'kettle01', five_hour: null, seven_day: 96, five_hour_resets_at: null, seven_day_resets_at: null }], hours: 2, limit: 95, working: 2, cap: 4, at: new Date('2026-10-14T02:30:00Z') });

  expect(hint.windows[0]?.atRate).toStrictEqual({ kind: 'reached' });
});

test('it says a window that is not rising approaches nothing', () => {
  const hint = buildCapacityHint({ samples: [{ at: '2026-10-14T01:00:00Z', account: 'kettle01', five_hour: null, seven_day: 16, five_hour_resets_at: null, seven_day_resets_at: null }, { at: '2026-10-14T01:30:00Z', account: 'kettle01', five_hour: null, seven_day: 16, five_hour_resets_at: null, seven_day_resets_at: null }, { at: '2026-10-14T02:00:00Z', account: 'kettle01', five_hour: null, seven_day: 16, five_hour_resets_at: null, seven_day_resets_at: null }], hours: 2, limit: 95, working: 2, cap: 4, at: new Date('2026-10-14T02:30:00Z') });

  expect(hint.windows[0]?.atRate).toStrictEqual({ kind: 'flat' });
});

test('it gives no projection for a window with too few samples', () => {
  const hint = buildCapacityHint({ samples: [{ at: '2026-10-14T01:00:00Z', account: 'kettle01', five_hour: null, seven_day: 10, five_hour_resets_at: null, seven_day_resets_at: null }, { at: '2026-10-14T01:30:00Z', account: 'kettle01', five_hour: null, seven_day: 12, five_hour_resets_at: null, seven_day_resets_at: null }, { at: '2026-10-14T02:00:00Z', account: 'kettle01', five_hour: null, seven_day: 14, five_hour_resets_at: null, seven_day_resets_at: null }, { at: '2026-10-14T02:30:00Z', account: 'kettle01', five_hour: null, seven_day: 16, five_hour_resets_at: null, seven_day_resets_at: null }].slice(0, 2), hours: 2, limit: 95, working: 2, cap: 4, at: new Date('2026-10-14T02:30:00Z') });

  expect(hint.windows[0]).toMatchObject({ samples: 2, ratePerHour: null, atRate: null, atCap: null });
});

test('it labels the working average as the current count, since no history is kept', () => {
  const hint = buildCapacityHint({ samples: [{ at: '2026-10-14T01:00:00Z', account: 'kettle01', five_hour: null, seven_day: 10, five_hour_resets_at: null, seven_day_resets_at: null }, { at: '2026-10-14T01:30:00Z', account: 'kettle01', five_hour: null, seven_day: 12, five_hour_resets_at: null, seven_day_resets_at: null }, { at: '2026-10-14T02:00:00Z', account: 'kettle01', five_hour: null, seven_day: 14, five_hour_resets_at: null, seven_day_resets_at: null }, { at: '2026-10-14T02:30:00Z', account: 'kettle01', five_hour: null, seven_day: 16, five_hour_resets_at: null, seven_day_resets_at: null }], hours: 2, limit: 95, working: 2, cap: 4, at: new Date('2026-10-14T02:30:00Z') });

  expect(hint.working).toStrictEqual({ average: 2, basis: 'current count, no history' });
});
