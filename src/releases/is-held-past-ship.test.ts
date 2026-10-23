import { expect, test } from 'bun:test';
import { isHeldPastShip } from './is-held-past-ship.ts';

test.each([
  { name: 'no hold', heldAt: null, shippedAt: ['2026-10-12T05:00:00Z'], held: false },
  { name: 'a hold after every ship time', heldAt: '2026-10-12T06:00:00Z', shippedAt: ['2026-10-12T05:00:00Z', '2026-10-11T05:00:00Z'], held: true },
  { name: 'a hold at the ship time', heldAt: '2026-10-12T05:00:00Z', shippedAt: ['2026-10-12T05:00:00Z'], held: true },
  { name: 'a hold before one ship time', heldAt: '2026-10-12T06:00:00Z', shippedAt: ['2026-10-12T05:00:00Z', '2026-10-12T07:00:00Z'], held: false },
])('it gives $held for $name', (row) => {
  expect(isHeldPastShip(row.heldAt, row.shippedAt)).toBe(row.held);
});
