import { expect, test } from 'bun:test';
import { findSafeCap } from './find-safe-cap.ts';
import { simulateFleet } from './simulate-fleet.ts';

test('it finds the highest lane count whose run has no pause', () => {
  const found = findSafeCap(6, (lanes) =>
    simulateFleet({
      now: new Date('2026-10-14T00:00:00Z'),
      slots: [
        { slot: 1, five: 0, fiveResetsAt: null, seven: 20, sevenResetsAt: new Date('2026-10-18T00:00:00Z') },
        { slot: 2, five: 0, fiveResetsAt: null, seven: 96, sevenResetsAt: new Date('2026-10-18T12:00:00Z') },
      ],
      active: 1,
      limit: 95,
      rateAt: () => ({ five: 0, seven: 0.2 * lanes }),
    }),
  );

  expect(found).toStrictEqual({ lanes: 3, endsAt: '2026-10-18T12:00:00Z' });
});

test('it gives null when even 0 lanes pause', () => {
  const found = findSafeCap(2, () => ({ switches: [], pause: { start: '2026-10-14T01:00:00Z', end: '2026-10-15T01:00:00Z', hours: 24 }, endsAt: '2026-10-15T01:00:00Z' }));

  expect(found).toBeNull();
});
