import { expect, test } from 'bun:test';
import { buildFleetView } from './build-fleet-view.ts';
import type { SlotRow } from './types.ts';

test('it forecasts a pause, the slots that cannot be a target left out, and the highest cap that avoids it', () => {
  const rows: SlotRow[] = [
    { at: '2026-10-14T00:30:00Z', slot: 1, status: '200', five: 20, fiveResetsAt: '2026-10-14T04:00:00Z', seven: 39, sevenResetsAt: '2026-10-18T00:00:00Z', workingLanes: 2 },
    { at: '2026-10-14T00:30:00Z', slot: 2, status: '200', five: 0, fiveResetsAt: null, seven: 96, sevenResetsAt: '2026-10-18T12:00:00Z', workingLanes: 2 },
    { at: '2026-10-14T00:30:00Z', slot: 3, status: '403', five: null, fiveResetsAt: null, seven: null, sevenResetsAt: null, workingLanes: 2 },
    { at: '2026-10-14T00:30:00Z', slot: 4, status: '200', five: 0, fiveResetsAt: null, seven: 97, sevenResetsAt: '2026-10-18T06:00:00Z', workingLanes: 2 },
  ];
  const samples = ['2026-10-13T23:30:00Z', '2026-10-14T00:00:00Z', '2026-10-14T00:30:00Z', '2026-10-14T01:00:00Z'].map((at, index) => ({ at, account: 'abcdef012345', five_hour: 17 + index, seven_day: 38.5 + index * 0.5, five_hour_resets_at: '2026-10-14T04:00:00Z', seven_day_resets_at: '2026-10-18T00:00:00Z' }));

  const view = buildFleetView({ at: new Date('2026-10-14T01:00:00Z'), notSetUp: null, rows, samples, working: 2, cap: null });

  expect(view.active).toBe(1);
  expect(view.scaled).toBe(true);
  expect(view.forecast?.pause).toStrictEqual({ start: '2026-10-16T08:00:00Z', end: '2026-10-18T00:00:00Z', hours: 40 });
  expect(view.forecast?.safeCap).toStrictEqual({ lanes: 1, endsAt: '2026-10-18T12:00:00Z' });
  expect(view.slots.map((slot) => slot.active)).toStrictEqual([true, false, false, false]);
});

test('it forecasts no pause when the active slot never fills before a reset', () => {
  const rows: SlotRow[] = [
    { at: '2026-10-14T00:30:00Z', slot: 1, status: '200', five: 1, fiveResetsAt: null, seven: 10, sevenResetsAt: '2026-10-18T00:00:00Z', workingLanes: 2 },
    { at: '2026-10-14T00:30:00Z', slot: 2, status: '200', five: 0, fiveResetsAt: null, seven: 5, sevenResetsAt: '2026-10-19T00:00:00Z', workingLanes: 2 },
  ];
  const samples = ['2026-10-13T23:30:00Z', '2026-10-14T00:00:00Z', '2026-10-14T00:30:00Z', '2026-10-14T01:00:00Z'].map((at, index) => ({ at, account: 'abcdef012345', five_hour: 1, seven_day: 10 + index * 0.1, five_hour_resets_at: null, seven_day_resets_at: '2026-10-18T00:00:00Z' }));

  const view = buildFleetView({ at: new Date('2026-10-14T01:00:00Z'), notSetUp: null, rows, samples, working: 2, cap: null });

  expect(view.forecast).toStrictEqual({ switches: [], pause: null, safeCap: null, endsAt: '2026-10-19T00:00:00Z' });
});

test('it says the active slot is unknown when no slot has the sample reset', () => {
  const rows: SlotRow[] = [{ at: '2026-10-14T00:30:00Z', slot: 1, status: '200', five: 1, fiveResetsAt: null, seven: 10, sevenResetsAt: '2026-10-18T00:00:00Z', workingLanes: 2 }];
  const samples = [{ at: '2026-10-14T01:00:00Z', account: 'abcdef012345', five_hour: 1, seven_day: 10, five_hour_resets_at: null, seven_day_resets_at: '2026-10-21T00:00:00Z' }];

  const view = buildFleetView({ at: new Date('2026-10-14T01:00:00Z'), notSetUp: null, rows, samples, working: 2, cap: null });

  expect(view.active).toBeNull();
  expect(view.forecast).toBeNull();
  expect(view.note).toBe('the active slot is unknown: no slot has the 7-day reset of the newest usage sample');
});

test('it says the slot reads are not set up, and still lists the slots it has stored', () => {
  const rows: SlotRow[] = [{ at: '2026-10-14T00:30:00Z', slot: 1, status: '200', five: 1, fiveResetsAt: null, seven: 10, sevenResetsAt: '2026-10-18T00:00:00Z', workingLanes: 2 }];

  const view = buildFleetView({ at: new Date('2026-10-14T01:00:00Z'), notSetUp: 'no settings file at /invented/settings.json', rows, samples: [], working: 0, cap: null });

  expect(view.notSetUp).toBe('no settings file at /invented/settings.json');
  expect(view.forecast).toBeNull();
  expect(view.slots).toHaveLength(1);
});

test('it points at --refresh-slots when no slot has been read', () => {
  const view = buildFleetView({ at: new Date('2026-10-14T01:00:00Z'), notSetUp: null, rows: [], samples: [], working: 0, cap: null });

  expect(view.note).toBe('no slot reads yet: hq capacity --refresh-slots reads them now');
});

test('it says the newest usage sample is old rather than the active slot is unknown when the sample is stale', () => {
  const rows: SlotRow[] = [{ at: '2026-10-14T00:30:00Z', slot: 1, status: '200', five: 1, fiveResetsAt: null, seven: 10, sevenResetsAt: '2026-10-18T00:00:00Z', workingLanes: 2 }];
  const samples = [{ at: '2026-10-14T00:00:00Z', account: 'abcdef012345', five_hour: 1, seven_day: 10, five_hour_resets_at: null, seven_day_resets_at: '2026-10-18T00:00:00Z' }];

  const view = buildFleetView({ at: new Date('2026-10-14T01:00:00Z'), notSetUp: null, rows, samples, working: 2, cap: null });

  expect(view.forecast).toBeNull();
  expect(view.note).toBe('the newest usage sample is 60 min old');
});
