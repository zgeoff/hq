import { expect, test } from 'bun:test';
import { buildMockBurnDay } from '../../../test/build-mock-burn-day.ts';
import { buildMockSlotRow } from '../../../test/build-mock-slot-row.ts';
import { buildFleetView } from './build-fleet-view.ts';
import type { SlotRow } from './types.ts';

test('it forecasts a pause, the slots that cannot be a target left out, and the highest cap that avoids it', () => {
  const rows: SlotRow[] = [
    buildMockSlotRow({ five: 20, fiveResetsAt: '2026-10-14T04:00:00Z', seven: 39 }),
    buildMockSlotRow({ slot: 2, seven: 96, sevenResetsAt: '2026-10-18T12:00:00Z' }),
    buildMockSlotRow({ slot: 3, status: '403', five: null, seven: null, sevenResetsAt: null }),
    buildMockSlotRow({ slot: 4, seven: 97, sevenResetsAt: '2026-10-18T06:00:00Z' }),
  ];
  const samples = ['2026-10-13T23:30:00Z', '2026-10-14T00:00:00Z', '2026-10-14T00:30:00Z', '2026-10-14T01:00:00Z'].map((at, index) => ({ at, account: 'abcdef012345', five_hour: 17 + index, seven_day: 38.5 + index * 0.5, five_hour_resets_at: '2026-10-14T04:00:00Z', seven_day_resets_at: '2026-10-18T00:00:00Z' }));

  const view = buildFleetView({ at: new Date('2026-10-14T01:00:00Z'), notSetUp: null, rows, samples, working: 2, cap: null });

  expect(view).toMatchInlineSnapshot(`
    {
      "active": 1,
      "forecast": {
        "endsAt": "2026-10-18T12:00:00Z",
        "pause": {
          "end": "2026-10-18T00:00:00Z",
          "hours": 40,
          "start": "2026-10-16T08:00:00Z",
        },
        "safeCap": {
          "endsAt": "2026-10-18T12:00:00Z",
          "lanes": 1,
        },
        "switches": [
          {
            "at": "2026-10-18T00:00:00Z",
            "from": null,
            "to": 1,
          },
        ],
      },
      "lanes": {
        "cap": null,
        "working": 2,
      },
      "limit": 95,
      "notSetUp": null,
      "note": null,
      "ratePerHour": {
        "five": 2,
        "seven": 1,
      },
      "scaled": "history",
      "slots": [
        {
          "active": true,
          "five": 20,
          "fiveResetsAt": "2026-10-14T04:00:00Z",
          "readAgeMin": 30,
          "readAt": "2026-10-14T00:30:00Z",
          "reading": "known",
          "seven": 39,
          "sevenResetsAt": "2026-10-18T00:00:00Z",
          "slot": 1,
          "status": "200",
        },
        {
          "active": false,
          "five": 0,
          "fiveResetsAt": null,
          "readAgeMin": 30,
          "readAt": "2026-10-14T00:30:00Z",
          "reading": "known",
          "seven": 96,
          "sevenResetsAt": "2026-10-18T12:00:00Z",
          "slot": 2,
          "status": "200",
        },
        {
          "active": false,
          "readAgeMin": 30,
          "readAt": "2026-10-14T00:30:00Z",
          "reading": "unknown",
          "slot": 3,
          "status": "403",
        },
        {
          "active": false,
          "five": 0,
          "fiveResetsAt": null,
          "readAgeMin": 30,
          "readAt": "2026-10-14T00:30:00Z",
          "reading": "known",
          "seven": 97,
          "sevenResetsAt": "2026-10-18T06:00:00Z",
          "slot": 4,
          "status": "200",
        },
      ],
    }
  `);
});

test('it scales a burn measured at 2 lanes to 4 working lanes on the lane fit and finds the cap that avoids the pause at that rate', () => {
  const rows: SlotRow[] = [
    buildMockSlotRow({ at: '2026-10-14T01:00:00Z', seven: 10, sevenResetsAt: '2026-10-21T13:00:00Z', workingLanes: 0 }),
    buildMockSlotRow({ at: '2026-10-14T02:00:00Z', seven: 11, sevenResetsAt: '2026-10-21T13:00:00Z' }),
    buildMockSlotRow({ at: '2026-10-14T03:00:00Z', seven: 14, sevenResetsAt: '2026-10-21T13:00:00Z', workingLanes: 4 }),
    buildMockSlotRow({ at: '2026-10-14T04:00:00Z', seven: 19, sevenResetsAt: '2026-10-21T13:00:00Z' }),
    buildMockSlotRow({ at: '2026-10-21T00:00:00Z', seven: 40, sevenResetsAt: '2026-10-21T13:00:00Z' }),
  ];
  const samples = [
    { at: '2026-10-14T01:00:00Z', account: 'kettle01', five_hour: 0, seven_day: 10, five_hour_resets_at: null, seven_day_resets_at: '2026-10-21T13:00:00Z' },
    { at: '2026-10-14T01:30:00Z', account: 'kettle01', five_hour: 0, seven_day: 10.5, five_hour_resets_at: null, seven_day_resets_at: '2026-10-21T13:00:00Z' },
    { at: '2026-10-14T02:00:00Z', account: 'kettle01', five_hour: 0, seven_day: 11, five_hour_resets_at: null, seven_day_resets_at: '2026-10-21T13:00:00Z' },
    { at: '2026-10-14T02:30:00Z', account: 'kettle01', five_hour: 0, seven_day: 12.5, five_hour_resets_at: null, seven_day_resets_at: '2026-10-21T13:00:00Z' },
    { at: '2026-10-14T03:00:00Z', account: 'kettle01', five_hour: 0, seven_day: 14, five_hour_resets_at: null, seven_day_resets_at: '2026-10-21T13:00:00Z' },
    { at: '2026-10-14T03:30:00Z', account: 'kettle01', five_hour: 0, seven_day: 16.5, five_hour_resets_at: null, seven_day_resets_at: '2026-10-21T13:00:00Z' },
    { at: '2026-10-14T04:00:00Z', account: 'kettle01', five_hour: 0, seven_day: 19, five_hour_resets_at: null, seven_day_resets_at: '2026-10-21T13:00:00Z' },
    { at: '2026-10-21T00:00:00Z', account: 'kettle01', five_hour: 0, seven_day: 40, five_hour_resets_at: null, seven_day_resets_at: '2026-10-21T13:00:00Z' },
    { at: '2026-10-21T00:30:00Z', account: 'kettle01', five_hour: 0, seven_day: 41.5, five_hour_resets_at: null, seven_day_resets_at: '2026-10-21T13:00:00Z' },
    { at: '2026-10-21T01:00:00Z', account: 'kettle01', five_hour: 0, seven_day: 43, five_hour_resets_at: null, seven_day_resets_at: '2026-10-21T13:00:00Z' },
  ];

  const view = buildFleetView({ at: new Date('2026-10-21T01:00:00Z'), notSetUp: null, rows, samples, working: 4, cap: null });

  expect(view.scaled).toBeNull();
  expect(view.ratePerHour?.seven).toBeCloseTo(5, 6);
  expect(view.forecast?.pause).toStrictEqual({ start: '2026-10-21T11:30:00Z', end: '2026-10-21T13:00:00Z', hours: 1.5 });
  expect(view.forecast?.safeCap).toStrictEqual({ lanes: 3, endsAt: '2026-10-21T13:00:00Z' });
});

test('it forecasts the pause on the night mean once a steep daytime slope is 2 hours old', () => {
  const rows: SlotRow[] = [buildMockSlotRow({ at: '2026-10-15T04:30:00Z', seven: 44, sevenResetsAt: '2026-10-21T00:00:00Z' })];
  const samples = [
    ...buildMockBurnDay().map((point) => ({ at: point.at, account: 'teapot02', five_hour: 0, seven_day: point.percent, five_hour_resets_at: null, seven_day_resets_at: '2026-10-19T00:00:00Z' })),
    { at: '2026-10-15T03:00:00Z', account: 'kettle01', five_hour: 0, seven_day: 32, five_hour_resets_at: null, seven_day_resets_at: '2026-10-21T00:00:00Z' },
    { at: '2026-10-15T03:30:00Z', account: 'kettle01', five_hour: 0, seven_day: 36, five_hour_resets_at: null, seven_day_resets_at: '2026-10-21T00:00:00Z' },
    { at: '2026-10-15T04:00:00Z', account: 'kettle01', five_hour: 0, seven_day: 40, five_hour_resets_at: null, seven_day_resets_at: '2026-10-21T00:00:00Z' },
    { at: '2026-10-15T04:30:00Z', account: 'kettle01', five_hour: 0, seven_day: 44, five_hour_resets_at: null, seven_day_resets_at: '2026-10-21T00:00:00Z' },
    { at: '2026-10-15T05:00:00Z', account: 'kettle01', five_hour: 0, seven_day: 48, five_hour_resets_at: null, seven_day_resets_at: '2026-10-21T00:00:00Z' },
  ];

  const view = buildFleetView({ at: new Date('2026-10-15T05:00:00Z'), notSetUp: null, rows, samples, working: 2, cap: null });

  expect(view.forecast?.pause).toStrictEqual({ start: '2026-10-16T02:45:00Z', end: '2026-10-21T00:00:00Z', hours: 117.25 });
});

test('it forecasts no pause when the active slot never fills before a reset', () => {
  const rows: SlotRow[] = [
    buildMockSlotRow({ five: 1, seven: 10 }),
    buildMockSlotRow({ slot: 2, seven: 5, sevenResetsAt: '2026-10-19T00:00:00Z' }),
  ];
  const samples = ['2026-10-13T23:30:00Z', '2026-10-14T00:00:00Z', '2026-10-14T00:30:00Z', '2026-10-14T01:00:00Z'].map((at, index) => ({ at, account: 'abcdef012345', five_hour: 1, seven_day: 10 + index * 0.1, five_hour_resets_at: null, seven_day_resets_at: '2026-10-18T00:00:00Z' }));

  const view = buildFleetView({ at: new Date('2026-10-14T01:00:00Z'), notSetUp: null, rows, samples, working: 2, cap: null });

  expect(view.forecast).toStrictEqual({ switches: [], pause: null, safeCap: null, endsAt: '2026-10-19T00:00:00Z' });
});

test("it pools an earlier account's burn into the hour of the day and keeps the 2 h slope on the active account", () => {
  const rows: SlotRow[] = [
    buildMockSlotRow({ five: 1, seven: 11 }),
    buildMockSlotRow({ slot: 2, seven: 70, sevenResetsAt: '2026-10-19T00:00:00Z' }),
  ];
  const samples = [
    { at: '2026-10-13T01:00:00Z', account: 'teapot02', five_hour: 1, seven_day: 50, five_hour_resets_at: null, seven_day_resets_at: '2026-10-19T00:00:00Z' },
    { at: '2026-10-13T01:30:00Z', account: 'teapot02', five_hour: 1, seven_day: 53, five_hour_resets_at: null, seven_day_resets_at: '2026-10-19T00:00:00Z' },
    { at: '2026-10-14T00:00:00Z', account: 'kettle01', five_hour: 1, seven_day: 10, five_hour_resets_at: null, seven_day_resets_at: '2026-10-18T00:00:00Z' },
    { at: '2026-10-14T00:10:00Z', account: 'teapot02', five_hour: 1, seven_day: 70, five_hour_resets_at: null, seven_day_resets_at: '2026-10-19T00:00:00Z' },
    { at: '2026-10-14T00:30:00Z', account: 'kettle01', five_hour: 1, seven_day: 11, five_hour_resets_at: null, seven_day_resets_at: '2026-10-18T00:00:00Z' },
    { at: '2026-10-14T01:00:00Z', account: 'kettle01', five_hour: 1, seven_day: 12, five_hour_resets_at: null, seven_day_resets_at: '2026-10-18T00:00:00Z' },
  ];

  const view = buildFleetView({ at: new Date('2026-10-14T01:00:00Z'), notSetUp: null, rows, samples, working: 2, cap: null });

  expect(view.active).toBe(1);
  expect(view.ratePerHour?.seven).toBeCloseTo(4, 6);
});

test('it simulates an inactive slot on its usage sample when that sample is newer than its slot read', () => {
  const rows: SlotRow[] = [
    buildMockSlotRow({ seven: 80 }),
    buildMockSlotRow({ slot: 2, seven: 40, sevenResetsAt: '2026-10-19T00:00:00Z' }),
  ];
  const samples = [
    { at: '2026-10-14T01:00:00Z', account: 'kettle01', five_hour: 0, seven_day: 90, five_hour_resets_at: null, seven_day_resets_at: '2026-10-18T00:00:00Z' },
    { at: '2026-10-14T01:30:00Z', account: 'kettle01', five_hour: 0, seven_day: 95, five_hour_resets_at: null, seven_day_resets_at: '2026-10-18T00:00:30Z' },
    { at: '2026-10-14T02:00:00Z', account: 'teapot02', five_hour: 0, seven_day: 41, five_hour_resets_at: null, seven_day_resets_at: '2026-10-19T00:00:00Z' },
    { at: '2026-10-14T02:30:00Z', account: 'teapot02', five_hour: 0, seven_day: 42, five_hour_resets_at: null, seven_day_resets_at: '2026-10-19T00:00:00Z' },
    { at: '2026-10-14T03:00:00Z', account: 'teapot02', five_hour: 0, seven_day: 43, five_hour_resets_at: null, seven_day_resets_at: '2026-10-19T00:00:00Z' },
  ];

  const view = buildFleetView({ at: new Date('2026-10-14T03:00:00Z'), notSetUp: null, rows, samples, working: 2, cap: null });

  expect(view.active).toBe(2);
  expect(view.forecast?.switches).toStrictEqual([{ at: '2026-10-18T00:15:00Z', from: null, to: 1 }]);
  expect(view.forecast?.pause?.end).toBe('2026-10-18T00:15:00Z');
});

test('it starts the active slot from its slot read when that read is newer than the newest usage sample', () => {
  const rows: SlotRow[] = [
    buildMockSlotRow({ at: '2026-10-14T01:15:00Z', seven: 96 }),
    buildMockSlotRow({ at: '2026-10-14T01:15:00Z', slot: 2, seven: 10, sevenResetsAt: '2026-10-19T00:00:00Z' }),
  ];
  const samples = ['2026-10-13T23:30:00Z', '2026-10-14T00:00:00Z', '2026-10-14T00:30:00Z', '2026-10-14T01:00:00Z'].map((at, index) => ({ at, account: 'kettle01', five_hour: 0, seven_day: 78.5 + index * 0.5, five_hour_resets_at: null, seven_day_resets_at: '2026-10-18T00:00:00Z' }));

  const view = buildFleetView({ at: new Date('2026-10-14T01:15:00Z'), notSetUp: null, rows, samples, working: 2, cap: null });

  expect(view.active).toBe(1);
  expect(view.forecast?.switches[0]).toStrictEqual({ at: '2026-10-14T01:15:00Z', from: 1, to: 2 });
});

test('it starts the active slot from the newest usage sample when that sample is newer than its slot read', () => {
  const rows: SlotRow[] = [
    buildMockSlotRow({ seven: 96 }),
    buildMockSlotRow({ slot: 2, seven: 10, sevenResetsAt: '2026-10-19T00:00:00Z' }),
  ];
  const samples = ['2026-10-13T23:30:00Z', '2026-10-14T00:00:00Z', '2026-10-14T00:30:00Z', '2026-10-14T01:00:00Z'].map((at, index) => ({ at, account: 'kettle01', five_hour: 0, seven_day: 78.5 + index * 0.5, five_hour_resets_at: null, seven_day_resets_at: '2026-10-18T00:00:00Z' }));

  const view = buildFleetView({ at: new Date('2026-10-14T01:00:00Z'), notSetUp: null, rows, samples, working: 2, cap: null });

  expect(view.active).toBe(1);
  expect(view.forecast?.switches[0]).toStrictEqual({ at: '2026-10-14T16:00:00Z', from: 1, to: 2 });
});

test('it keeps the 5-hour figure of a slot read when the newer usage sample has none', () => {
  const rows: SlotRow[] = [
    buildMockSlotRow({ seven: 93 }),
    buildMockSlotRow({ slot: 2, five: 96, fiveResetsAt: '2026-10-14T04:00:00Z', seven: 40, sevenResetsAt: '2026-10-19T00:00:00Z' }),
  ];
  const samples = [
    { at: '2026-10-13T23:30:00Z', account: 'kettle01', five_hour: 0, seven_day: 92.5, five_hour_resets_at: null, seven_day_resets_at: '2026-10-18T00:00:00Z' },
    { at: '2026-10-14T00:00:00Z', account: 'kettle01', five_hour: 0, seven_day: 93, five_hour_resets_at: null, seven_day_resets_at: '2026-10-18T00:00:00Z' },
    { at: '2026-10-14T00:30:00Z', account: 'kettle01', five_hour: 0, seven_day: 93.5, five_hour_resets_at: null, seven_day_resets_at: '2026-10-18T00:00:00Z' },
    { at: '2026-10-14T00:45:00Z', account: 'teapot02', five_hour: null, seven_day: 41, five_hour_resets_at: null, seven_day_resets_at: '2026-10-19T00:00:00Z' },
    { at: '2026-10-14T01:00:00Z', account: 'kettle01', five_hour: 0, seven_day: 94, five_hour_resets_at: null, seven_day_resets_at: '2026-10-18T00:00:00Z' },
  ];

  const view = buildFleetView({ at: new Date('2026-10-14T01:00:00Z'), notSetUp: null, rows, samples, working: 2, cap: null });

  expect(view.active).toBe(1);
  expect(view.forecast?.switches[0]).toStrictEqual({ at: '2026-10-14T04:00:00Z', from: null, to: 2 });
});

test('it keeps the 7-day figure of the active slot read when the newer usage sample has none', () => {
  const rows: SlotRow[] = [
    buildMockSlotRow({ seven: 96 }),
    buildMockSlotRow({ slot: 2, seven: 10, sevenResetsAt: '2026-10-19T00:00:00Z' }),
  ];
  const samples = [
    { at: '2026-10-13T23:30:00Z', account: 'kettle01', five_hour: 0, seven_day: 94.5, five_hour_resets_at: null, seven_day_resets_at: '2026-10-18T00:00:00Z' },
    { at: '2026-10-14T00:00:00Z', account: 'kettle01', five_hour: 0, seven_day: 95, five_hour_resets_at: null, seven_day_resets_at: '2026-10-18T00:00:00Z' },
    { at: '2026-10-14T00:30:00Z', account: 'kettle01', five_hour: 0, seven_day: 95.5, five_hour_resets_at: null, seven_day_resets_at: '2026-10-18T00:00:00Z' },
    { at: '2026-10-14T01:00:00Z', account: 'kettle01', five_hour: 0, seven_day: null, five_hour_resets_at: null, seven_day_resets_at: '2026-10-18T00:00:00Z' },
  ];

  const view = buildFleetView({ at: new Date('2026-10-14T01:00:00Z'), notSetUp: null, rows, samples, working: 2, cap: null });

  expect(view.note).toBeNull();
  expect(view.forecast?.switches[0]).toStrictEqual({ at: '2026-10-14T01:00:00Z', from: 1, to: 2 });
});

test('it keeps the 5-hour figure of an earlier newer sample when the newest sample has only a 7-day figure', () => {
  const rows: SlotRow[] = [
    buildMockSlotRow({ at: '2026-10-14T00:20:00Z', seven: 50 }),
    buildMockSlotRow({ at: '2026-10-14T00:20:00Z', slot: 2, seven: 10, sevenResetsAt: '2026-10-19T00:00:00Z' }),
  ];
  const samples = [
    { at: '2026-10-13T23:30:00Z', account: 'kettle01', five_hour: 90, seven_day: 49, five_hour_resets_at: '2026-10-14T03:00:00Z', seven_day_resets_at: '2026-10-18T00:00:00Z' },
    { at: '2026-10-14T00:00:00Z', account: 'kettle01', five_hour: 93, seven_day: 49.5, five_hour_resets_at: '2026-10-14T03:00:00Z', seven_day_resets_at: '2026-10-18T00:00:00Z' },
    { at: '2026-10-14T00:45:00Z', account: 'kettle01', five_hour: 96, seven_day: 50, five_hour_resets_at: '2026-10-14T03:00:00Z', seven_day_resets_at: '2026-10-18T00:00:00Z' },
    { at: '2026-10-14T01:00:00Z', account: 'kettle01', five_hour: null, seven_day: 50.5, five_hour_resets_at: null, seven_day_resets_at: '2026-10-18T00:00:00Z' },
  ];

  const view = buildFleetView({ at: new Date('2026-10-14T01:00:00Z'), notSetUp: null, rows, samples, working: 2, cap: null });

  expect(view.active).toBe(1);
  expect(view.forecast?.switches[0]).toStrictEqual({ at: '2026-10-14T01:00:00Z', from: 1, to: 2 });
});

test('it keeps the slot read 5-hour reset still to come when the newest sample gives a 5-hour figure with no reset', () => {
  const rows: SlotRow[] = [
    buildMockSlotRow({ at: '2026-10-14T00:20:00Z', five: 20, fiveResetsAt: '2026-10-14T04:00:00Z' }),
    buildMockSlotRow({ at: '2026-10-14T00:20:00Z', slot: 2, seven: 94.9, sevenResetsAt: '2026-10-19T00:00:00Z' }),
  ];
  const samples = [
    { at: '2026-10-13T23:30:00Z', account: 'kettle01', five_hour: 90, seven_day: 29, five_hour_resets_at: null, seven_day_resets_at: '2026-10-18T00:00:00Z' },
    { at: '2026-10-14T00:00:00Z', account: 'kettle01', five_hour: 93, seven_day: 29.5, five_hour_resets_at: null, seven_day_resets_at: '2026-10-18T00:00:00Z' },
    { at: '2026-10-14T00:30:00Z', account: 'kettle01', five_hour: 95, seven_day: 30, five_hour_resets_at: null, seven_day_resets_at: '2026-10-18T00:00:00Z' },
    { at: '2026-10-14T01:00:00Z', account: 'kettle01', five_hour: 97, seven_day: 30.5, five_hour_resets_at: null, seven_day_resets_at: '2026-10-18T00:00:00Z' },
  ];

  const view = buildFleetView({ at: new Date('2026-10-14T01:00:00Z'), notSetUp: null, rows, samples, working: 2, cap: null });

  expect(view.forecast?.pause).toStrictEqual({ start: '2026-10-14T01:15:00Z', end: '2026-10-14T04:00:00Z', hours: 2.75 });
});

test('it gives no rate and no forecast and says the samples are too few when only one usage sample matches', () => {
  const rows: SlotRow[] = [buildMockSlotRow({ at: '2026-10-14T00:50:00Z', five: 4, fiveResetsAt: '2026-10-14T03:00:00Z' })];
  const samples = [{ at: '2026-10-14T00:55:00Z', account: 'kettle01', five_hour: 5, seven_day: 31, five_hour_resets_at: '2026-10-14T03:00:00Z', seven_day_resets_at: '2026-10-18T00:00:00Z' }];

  const view = buildFleetView({ at: new Date('2026-10-14T01:00:00Z'), notSetUp: null, rows, samples, working: 2, cap: null });

  expect(view).toStrictEqual({
    notSetUp: null,
    limit: 95,
    active: 1,
    slots: [{ reading: 'known', slot: 1, active: true, status: '200', five: 4, fiveResetsAt: '2026-10-14T03:00:00Z', seven: 30, sevenResetsAt: '2026-10-18T00:00:00Z', readAt: '2026-10-14T00:50:00Z', readAgeMin: 10 }],
    lanes: { working: 2, cap: null },
    ratePerHour: null,
    scaled: null,
    forecast: null,
    note: 'too few usage samples for a burn rate',
  });
});

test('it keeps a slot whose newest read failed in the simulation on its last good reading', () => {
  const rows: SlotRow[] = [
    buildMockSlotRow({ at: '2026-10-14T00:00:00Z', five: 1, seven: 10 }),
    buildMockSlotRow({ at: '2026-10-14T00:00:00Z', slot: 2, seven: 5, sevenResetsAt: '2026-10-19T00:00:00Z' }),
    buildMockSlotRow({ five: 1, seven: 10 }),
    buildMockSlotRow({ slot: 2, status: 'request-failed', five: null, seven: null, sevenResetsAt: null }),
  ];
  const samples = ['2026-10-13T23:30:00Z', '2026-10-14T00:00:00Z', '2026-10-14T00:30:00Z', '2026-10-14T01:00:00Z'].map((at, index) => ({ at, account: 'abcdef012345', five_hour: 1, seven_day: 10 + index * 0.1, five_hour_resets_at: null, seven_day_resets_at: '2026-10-18T00:00:00Z' }));

  const view = buildFleetView({ at: new Date('2026-10-14T01:00:00Z'), notSetUp: null, rows, samples, working: 2, cap: null });

  expect(view.slots[1]).toStrictEqual({ reading: 'known', slot: 2, active: false, status: '200', five: 0, fiveResetsAt: null, seven: 5, sevenResetsAt: '2026-10-19T00:00:00Z', readAt: '2026-10-14T00:00:00Z', readAgeMin: 60 });
  expect(view.forecast?.endsAt).toBe('2026-10-19T00:00:00Z');
});

test('it lists a slot with no good reading in 6 hours as unknown and leaves it out of the simulation', () => {
  const rows: SlotRow[] = [
    buildMockSlotRow({ at: '2026-10-13T18:00:00Z', slot: 2, seven: 5, sevenResetsAt: '2026-10-19T00:00:00Z' }),
    buildMockSlotRow({ five: 1, seven: 10 }),
    buildMockSlotRow({ slot: 2, status: '403', five: null, seven: null, sevenResetsAt: null }),
  ];
  const samples = ['2026-10-13T23:30:00Z', '2026-10-14T00:00:00Z', '2026-10-14T00:30:00Z', '2026-10-14T01:00:00Z'].map((at, index) => ({ at, account: 'abcdef012345', five_hour: 1, seven_day: 10 + index * 0.1, five_hour_resets_at: null, seven_day_resets_at: '2026-10-18T00:00:00Z' }));

  const view = buildFleetView({ at: new Date('2026-10-14T01:00:00Z'), notSetUp: null, rows, samples, working: 2, cap: null });

  expect(view.slots[1]).toStrictEqual({ reading: 'unknown', slot: 2, active: false, status: '403', readAt: '2026-10-14T00:30:00Z', readAgeMin: 30 });
  expect(view.forecast?.endsAt).toBe('2026-10-18T00:00:00Z');
});

test('it says the active slot is unknown when no slot has the sample reset', () => {
  const rows: SlotRow[] = [buildMockSlotRow({ five: 1, seven: 10 })];
  const samples = [{ at: '2026-10-14T01:00:00Z', account: 'abcdef012345', five_hour: 1, seven_day: 10, five_hour_resets_at: null, seven_day_resets_at: '2026-10-21T00:00:00Z' }];

  const view = buildFleetView({ at: new Date('2026-10-14T01:00:00Z'), notSetUp: null, rows, samples, working: 2, cap: null });

  expect(view.active).toBeNull();
  expect(view.forecast).toBeNull();
  expect(view.note).toBe('the active slot is unknown: no slot has the 7-day reset of the newest usage sample');
});

test('it says the slot reads are not set up, and still lists the slots it has stored', () => {
  const rows: SlotRow[] = [buildMockSlotRow({ five: 1, seven: 10 })];

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
  const rows: SlotRow[] = [buildMockSlotRow({ five: 1, seven: 10 })];
  const samples = [{ at: '2026-10-14T00:00:00Z', account: 'abcdef012345', five_hour: 1, seven_day: 10, five_hour_resets_at: null, seven_day_resets_at: '2026-10-18T00:00:00Z' }];

  const view = buildFleetView({ at: new Date('2026-10-14T01:00:00Z'), notSetUp: null, rows, samples, working: 2, cap: null });

  expect(view.forecast).toBeNull();
  expect(view.note).toBe('the newest usage sample is 60 min old');
});
