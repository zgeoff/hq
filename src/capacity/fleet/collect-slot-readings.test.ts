import { expect, test } from 'bun:test';
import { collectSlotReadings } from './collect-slot-readings.ts';

test('it keeps the last good reading of a slot whose newest read failed', () => {
  const readings = collectSlotReadings(
    [
      { at: '2026-10-14T00:00:00Z', slot: 2, status: '200', five: 3, fiveResetsAt: null, seven: 30, sevenResetsAt: '2026-10-19T00:00:00Z', workingLanes: 2 },
      { at: '2026-10-14T02:00:00Z', slot: 2, status: 'request-failed', five: null, fiveResetsAt: null, seven: null, sevenResetsAt: null, workingLanes: 2 },
    ],
    new Date('2026-10-14T03:00:00Z'),
  );

  expect(readings).toStrictEqual({ known: [{ at: '2026-10-14T00:00:00Z', slot: 2, status: '200', five: 3, fiveResetsAt: null, seven: 30, sevenResetsAt: '2026-10-19T00:00:00Z', workingLanes: 2 }], unknown: [] });
});

test('it takes the newest reading with figures when several are in the window', () => {
  const readings = collectSlotReadings(
    [
      { at: '2026-10-14T00:00:00Z', slot: 1, status: '200', five: 3, fiveResetsAt: null, seven: 30, sevenResetsAt: '2026-10-19T00:00:00Z', workingLanes: 2 },
      { at: '2026-10-14T02:00:00Z', slot: 1, status: '200', five: 4, fiveResetsAt: null, seven: 31, sevenResetsAt: '2026-10-19T00:00:00Z', workingLanes: 2 },
    ],
    new Date('2026-10-14T03:00:00Z'),
  );

  expect(readings.known.map((row) => row.at)).toStrictEqual(['2026-10-14T02:00:00Z']);
});

test('it counts a slot unknown when its last good reading is over 6 hours old, keeping its newest read', () => {
  const readings = collectSlotReadings(
    [
      { at: '2026-10-13T20:59:00Z', slot: 3, status: '200', five: 3, fiveResetsAt: null, seven: 30, sevenResetsAt: '2026-10-19T00:00:00Z', workingLanes: 2 },
      { at: '2026-10-14T01:00:00Z', slot: 3, status: '403', five: null, fiveResetsAt: null, seven: null, sevenResetsAt: null, workingLanes: 2 },
    ],
    new Date('2026-10-14T03:00:00Z'),
  );

  expect(readings).toStrictEqual({ known: [], unknown: [{ at: '2026-10-14T01:00:00Z', slot: 3, status: '403', five: null, fiveResetsAt: null, seven: null, sevenResetsAt: null, workingLanes: 2 }] });
});

test('it counts a slot unknown when no read of it has figures', () => {
  const readings = collectSlotReadings([{ at: '2026-10-14T02:00:00Z', slot: 4, status: 'op-failed', five: null, fiveResetsAt: null, seven: null, sevenResetsAt: null, workingLanes: 2 }], new Date('2026-10-14T03:00:00Z'));

  expect(readings.unknown.map((row) => row.slot)).toStrictEqual([4]);
});
