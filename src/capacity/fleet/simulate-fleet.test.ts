import { expect, test } from 'bun:test';
import { simulateFleet } from './simulate-fleet.ts';

test('it hands over to the slot with the most room when the active slot reaches 95%', () => {
  const result = simulateFleet({
    now: new Date('2026-10-14T00:00:00Z'),
    slots: [
      { slot: 1, five: 0, fiveResetsAt: null, seven: 90, sevenResetsAt: new Date('2026-10-18T00:00:00Z') },
      { slot: 2, five: 0, fiveResetsAt: null, seven: 30, sevenResetsAt: new Date('2026-10-18T00:00:00Z') },
      { slot: 3, five: 0, fiveResetsAt: null, seven: 10, sevenResetsAt: new Date('2026-10-18T00:00:00Z') },
    ],
    active: 1,
    limit: 95,
    rateAt: (time) => ({ five: 0, seven: time.getTime() < Date.parse('2026-10-14T01:00:00Z') ? 5 : 0 }),
  });

  expect(result.switches.at(0)).toStrictEqual({ at: '2026-10-14T01:00:00Z', from: 1, to: 3 });
  expect(result.pause).toBeNull();
});

test('it does not pause when a reset frees a slot before the active one fills', () => {
  const result = simulateFleet({
    now: new Date('2026-10-14T00:00:00Z'),
    slots: [
      { slot: 1, five: 0, fiveResetsAt: null, seven: 90, sevenResetsAt: new Date('2026-10-18T00:00:00Z') },
      { slot: 2, five: 0, fiveResetsAt: null, seven: 96, sevenResetsAt: new Date('2026-10-14T00:30:00Z') },
    ],
    active: 1,
    limit: 95,
    rateAt: (time) => ({ five: 0, seven: time.getTime() < Date.parse('2026-10-14T01:00:00Z') ? 5 : 0 }),
  });

  expect(result.switches.at(0)).toStrictEqual({ at: '2026-10-14T01:00:00Z', from: 1, to: 2 });
  expect(result.pause).toBeNull();
});

test('it pauses when no slot is under 95% and ends the pause at the reset that frees one', () => {
  const result = simulateFleet({
    now: new Date('2026-10-14T00:00:00Z'),
    slots: [
      { slot: 1, five: 0, fiveResetsAt: null, seven: 90, sevenResetsAt: new Date('2026-10-18T00:00:00Z') },
      { slot: 2, five: 0, fiveResetsAt: null, seven: 96, sevenResetsAt: new Date('2026-10-16T00:00:00Z') },
    ],
    active: 1,
    limit: 95,
    rateAt: () => ({ five: 0, seven: 5 }),
  });

  expect(result.pause).toStrictEqual({ start: '2026-10-14T01:00:00Z', end: '2026-10-16T00:00:00Z', hours: 47 });
  expect(result.switches.at(0)).toStrictEqual({ at: '2026-10-16T00:00:00Z', from: null, to: 2 });
  expect(result.endsAt).toBe('2026-10-18T00:00:00Z');
});

test('it pauses until the last reset when nothing frees a slot before then', () => {
  const result = simulateFleet({
    now: new Date('2026-10-14T00:00:00Z'),
    slots: [
      { slot: 1, five: 94, fiveResetsAt: new Date('2026-10-16T00:00:00Z'), seven: 50, sevenResetsAt: new Date('2026-10-16T00:00:00Z') },
      { slot: 2, five: 0, fiveResetsAt: null, seven: 99, sevenResetsAt: new Date('2026-10-16T00:00:00Z') },
    ],
    active: 1,
    limit: 95,
    rateAt: () => ({ five: 4, seven: 0 }),
  });

  expect(result.pause).toStrictEqual({ start: '2026-10-14T00:15:00Z', end: '2026-10-16T00:00:00Z', hours: 47.75 });
});

test('it drops the 5-hour figure to 0 at its reset, so the active slot stays', () => {
  const result = simulateFleet({
    now: new Date('2026-10-14T00:00:00Z'),
    slots: [
      { slot: 1, five: 94, fiveResetsAt: new Date('2026-10-14T00:10:00Z'), seven: 10, sevenResetsAt: new Date('2026-10-18T00:00:00Z') },
      { slot: 2, five: 0, fiveResetsAt: null, seven: 10, sevenResetsAt: new Date('2026-10-18T00:00:00Z') },
    ],
    active: 1,
    limit: 95,
    rateAt: () => ({ five: 2, seven: 0 }),
  });

  expect(result.switches).toStrictEqual([]);
});

test('it rolls a 5-hour reset forward 5 hours after it falls', () => {
  const result = simulateFleet({
    now: new Date('2026-10-14T00:00:00Z'),
    slots: [
      { slot: 1, five: 0, fiveResetsAt: new Date('2026-10-14T00:30:00Z'), seven: 10, sevenResetsAt: new Date('2026-10-18T00:00:00Z') },
      { slot: 2, five: 0, fiveResetsAt: null, seven: 10, sevenResetsAt: new Date('2026-10-18T00:00:00Z') },
    ],
    active: 1,
    limit: 95,
    rateAt: () => ({ five: 18, seven: 0 }),
  });

  expect(result.switches).toStrictEqual([]);
});

test('it stops 8 days out when a 7-day reset is further away', () => {
  const result = simulateFleet({
    now: new Date('2026-10-14T00:00:00Z'),
    slots: [{ slot: 1, five: 0, fiveResetsAt: null, seven: 0, sevenResetsAt: new Date('2026-12-01T00:00:00Z') }],
    active: 1,
    limit: 95,
    rateAt: () => ({ five: 0, seven: 0 }),
  });

  expect(result.endsAt).toBe('2026-10-22T00:00:00Z');
});

test('it resets the 5-hour figure 5 hours after a slot with no 5-hour reset starts to burn', () => {
  const result = simulateFleet({
    now: new Date('2026-10-14T00:00:00Z'),
    slots: [
      { slot: 1, five: 0, fiveResetsAt: null, seven: 95, sevenResetsAt: new Date('2026-10-18T00:00:00Z') },
      { slot: 2, five: 0, fiveResetsAt: null, seven: 10, sevenResetsAt: new Date('2026-10-18T00:00:00Z') },
    ],
    active: 1,
    limit: 95,
    rateAt: () => ({ five: 20, seven: 0 }),
  });

  expect(result.pause).toStrictEqual({ start: '2026-10-14T04:45:00Z', end: '2026-10-14T05:00:00Z', hours: 0.25 });
});
