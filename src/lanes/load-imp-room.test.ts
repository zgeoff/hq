import type { Database } from 'bun:sqlite';
import { expect, onTestFinished, test } from 'bun:test';
import { createCapacitySample } from '../../test/create-capacity-sample.ts';
import { at, freshDb } from '../../test/helpers.ts';
import { setCapacitySetting } from '../capacity/set-capacity-setting.ts';
import { loadImpRoom } from './load-imp-room.ts';

function setupTest(): Database {
  const fresh = freshDb();
  at('2026-10-16T01:00:00Z');
  onTestFinished(fresh.cleanup);
  return fresh.db;
}

test('the tightest of the budget, the memory line and the vCPU line sets the slots, and is named', () => {
  const db = createCapacitySample(setupTest(), { at: '2026-10-16T00:55:00Z', nonnixAwakeMib: 8192, nonnixAwakeVcpus: 4 });
  const line = { awakeMib: 8192, maxMib: 16_384, awakeVcpus: 4, maxVcpus: 16, budgetMib: 1_048_576, nixAwakeMib: 0, keptMib: 0 };
  expect([loadImpRoom(db, { budgetSlots: 2, impMib: 2048 }), loadImpRoom(db, { budgetSlots: 6, impMib: 2048 })]).toStrictEqual([
    { slots: 2, heldBy: 'imp budget or provider quota', line },
    { slots: 4, heldBy: 'impd at line', line },
  ]);
  createCapacitySample(db, { at: '2026-10-16T00:55:00Z', nonnixAwakeMib: 8192, nonnixAwakeVcpus: 12 });
  expect([loadImpRoom(db, { budgetSlots: 6, impMib: 2048 }), loadImpRoom(setCapacityImpVcpus(db, '4'), { budgetSlots: 6, impMib: 2048 })]).toStrictEqual([
    { slots: 2, heldBy: 'impd at vCPU line', line: { ...line, awakeVcpus: 12 } },
    { slots: 1, heldBy: 'impd at vCPU line', line: { ...line, awakeVcpus: 12 } },
  ]);
});

test('one more imp takes some vCPUs: 0 is refused, so the vCPU line is always checked', () => {
  const db = setupTest();
  expect(() => setCapacitySetting(db, 'impVcpus', '0', 'kettle-bot')).toThrow('impVcpus must be more than 0');
  expect(setCapacitySetting(db, 'nonnixMaxVcpus', '0', 'kettle-bot').nonnixMaxVcpus).toBe(0);
});

test('both lines are the capacity watch\'s settings, their overrides included', () => {
  const db = createCapacitySample(setupTest(), { at: '2026-10-16T00:55:00Z', nonnixAwakeMib: 16_384, nonnixAwakeVcpus: 16 });
  const size = { budgetSlots: 4, impMib: 2048 };
  expect(loadImpRoom(db, size).slots).toBe(0);
  setCapacitySetting(db, 'nonnixMaxMib', '20480', 'kettle-bot');
  expect(loadImpRoom(db, size)).toMatchObject({ slots: 0, heldBy: 'impd at vCPU line' });
  setCapacitySetting(db, 'nonnixMaxVcpus', '20', 'kettle-bot');
  expect(loadImpRoom(db, size)).toStrictEqual({ slots: 2, heldBy: 'impd at line', line: { awakeMib: 16_384, maxMib: 20_480, awakeVcpus: 16, maxVcpus: 20, budgetMib: 1_048_576, nixAwakeMib: 0, keptMib: 0 } });
});

test('no sample, one with no memory or vCPU reading, or one over 15 min old holds every slot, and a later one is not read yet', () => {
  const db = setupTest();
  const held = { slots: 0, heldBy: 'no fresh impd reading', line: null };
  const size = { budgetSlots: 4, impMib: 2048 };
  expect(loadImpRoom(db, size)).toStrictEqual(held);
  createCapacitySample(db, { at: '2026-10-16T00:55:00Z', nonnixAwakeMib: null });
  expect(loadImpRoom(db, size)).toStrictEqual(held);
  createCapacitySample(db, { at: '2026-10-16T00:55:00Z', nonnixAwakeMib: 0, nonnixAwakeVcpus: null });
  expect(loadImpRoom(db, size)).toStrictEqual(held);
  createCapacitySample(db, { at: '2026-10-16T00:44:00Z', nonnixAwakeMib: 0 });
  db.query("DELETE FROM capacity_samples WHERE at = '2026-10-16T00:55:00Z'").run();
  expect(loadImpRoom(db, size)).toStrictEqual(held);
  createCapacitySample(db, { at: '2026-10-16T01:01:00Z', nonnixAwakeMib: 0 });
  expect(loadImpRoom(db, size)).toStrictEqual(held);
});

test.each([
  { keptMib: 3072, slots: 1, heldBy: 'impd priority reservation' },
  { keptMib: 0, slots: 2, heldBy: 'impd at budget' },
])('it holds the slots past the impd budget less the $keptMib MiB kept for priority imps, named $heldBy', (row) => {
  const db = createCapacitySample(setupTest(), { at: '2026-10-16T00:55:00Z', nonnixAwakeMib: 14_336, nixAwakeMib: 1024, impdBudgetMib: 20_480, impdPriorityKeptMib: row.keptMib });
  setCapacitySetting(db, 'nonnixMaxMib', '20480', 'kettle-bot');

  const room = loadImpRoom(db, { budgetSlots: 6, impMib: 2048 });

  expect(room).toStrictEqual({ slots: row.slots, heldBy: row.heldBy, line: { awakeMib: 14_336, maxMib: 20_480, awakeVcpus: 0, maxVcpus: 16, budgetMib: 20_480, nixAwakeMib: 1024, keptMib: row.keptMib } });
});

test.each([
  { field: 'nixAwakeMib', seed: { nixAwakeMib: null } },
  { field: 'impdBudgetMib', seed: { impdBudgetMib: null } },
  { field: 'impdPriorityKeptMib', seed: { impdPriorityKeptMib: null } },
])('it holds every slot when the sample has no $field reading', (row) => {
  const db = createCapacitySample(setupTest(), { at: '2026-10-16T00:55:00Z', nonnixAwakeMib: 8192, ...row.seed });

  const room = loadImpRoom(db, { budgetSlots: 4, impMib: 2048 });

  expect(room).toStrictEqual({ slots: 0, heldBy: 'no fresh impd reading', line: null });
});

test('it names the non-Nix line, not the RAM kept for priority imps, when the line is the tighter', () => {
  const db = createCapacitySample(setupTest(), { at: '2026-10-16T00:55:00Z', nonnixAwakeMib: 14_336, nixAwakeMib: 0, impdBudgetMib: 20_480, impdPriorityKeptMib: 1024 });

  const room = loadImpRoom(db, { budgetSlots: 6, impMib: 2048 });

  expect([room.slots, room.heldBy]).toStrictEqual([1, 'impd at line']);
});

function setCapacityImpVcpus(db: Database, vcpus: string): Database {
  setCapacitySetting(db, 'impVcpus', vcpus, 'kettle-bot');
  return db;
}
