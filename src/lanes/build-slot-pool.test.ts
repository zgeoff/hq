import { expect, test } from 'bun:test';
import { buildSlotPool } from './build-slot-pool.ts';

test('it leaves the pool free slots as they are with no cap', () => {
  const pool = buildSlotPool({ imp: 0, local: 5 }, { imp: 0, local: 0, localSource: null }, { room: null, localRoom: null, capRoom: null });

  expect(pool.free).toBe(5);
  expect(pool.capHeld).toBe(false);
});

test('it takes free slots off the pool when the cap room is below them', () => {
  const pool = buildSlotPool({ imp: 0, local: 5 }, { imp: 0, local: 0, localSource: null }, { room: null, localRoom: null, capRoom: 2 });

  expect(pool.free).toBe(2);
  expect(pool.capHeld).toBe(true);
});

test('it leaves the pool free slots when the cap room equals them', () => {
  const pool = buildSlotPool({ imp: 0, local: 5 }, { imp: 0, local: 0, localSource: null }, { room: null, localRoom: null, capRoom: 5 });

  expect(pool.free).toBe(5);
  expect(pool.capHeld).toBe(false);
});

test('it leaves the pool free slots when the cap room is above them', () => {
  const pool = buildSlotPool({ imp: 0, local: 5 }, { imp: 0, local: 0, localSource: null }, { room: null, localRoom: null, capRoom: 9 });

  expect(pool.free).toBe(5);
  expect(pool.capHeld).toBe(false);
});

test('it frees no slot under a cap with no room', () => {
  const pool = buildSlotPool({ imp: 0, local: 5 }, { imp: 0, local: 0, localSource: null }, { room: null, localRoom: null, capRoom: 0 });

  expect(pool.free).toBe(0);
  expect(pool.capHeld).toBe(true);
});

test('it holds nothing back when the pool has no free slot to hold', () => {
  const pool = buildSlotPool({ imp: 0, local: 2 }, { imp: 0, local: 2, localSource: null }, { room: null, localRoom: null, capRoom: 0 });

  expect(pool.free).toBe(0);
  expect(pool.capHeld).toBe(false);
});
