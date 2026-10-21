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
  const db = createCapacitySample(setupTest(), { at: '2026-10-16T00:55:00Z', nonnixAwakeMib: 8192, nonnixAwakeVcpus: 4 }),
    line = { awakeMib: 8192, maxMib: 16_384, awakeVcpus: 4, maxVcpus: 16 };
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
  const db = createCapacitySample(setupTest(), { at: '2026-10-16T00:55:00Z', nonnixAwakeMib: 16_384, nonnixAwakeVcpus: 16 }),
    size = { budgetSlots: 4, impMib: 2048 };
  expect(loadImpRoom(db, size).slots).toBe(0);
  setCapacitySetting(db, 'nonnixMaxMib', '20480', 'kettle-bot');
  expect(loadImpRoom(db, size)).toMatchObject({ slots: 0, heldBy: 'impd at vCPU line' });
  setCapacitySetting(db, 'nonnixMaxVcpus', '20', 'kettle-bot');
  expect(loadImpRoom(db, size)).toStrictEqual({ slots: 2, heldBy: 'impd at line', line: { awakeMib: 16_384, maxMib: 20_480, awakeVcpus: 16, maxVcpus: 20 } });
});

test('no sample, one with no memory or vCPU reading, or one over 15 min old holds every slot, and a later one is not read yet', () => {
  const db = setupTest(),
    held = { slots: 0, heldBy: 'no fresh impd reading', line: null },
    size = { budgetSlots: 4, impMib: 2048 };
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

function setCapacityImpVcpus(db: Database, vcpus: string): Database {
  setCapacitySetting(db, 'impVcpus', vcpus, 'kettle-bot');
  return db;
}
