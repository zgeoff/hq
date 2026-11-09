import type { Database } from 'bun:sqlite';
import { expect, onTestFinished, test } from 'bun:test';
import { at, freshDb } from '../../test/helpers.ts';
import { setCapacitySetting } from '../capacity/set-capacity-setting.ts';
import { buildSeeder } from '../test-utils/build-seeder.ts';
import { buildLineRoom, loadImpRoom } from './load-imp-room.ts';

function setupTest() {
  const fresh = freshDb();
  at('2026-10-16T01:00:00Z');
  onTestFinished(fresh.cleanup);
  return { db: fresh.db, seed: buildSeeder(fresh) };
}

test('it sets the slots by the tightest of the budget, the memory line and the vCPU line, and names it', async () => {
  const ctx = setupTest();
  await ctx.seed.capacitySample({ at: '2026-10-16T00:55:00Z', nonnix_awake_mib: 8192, nonnix_awake_vcpus: 4 });
  const line = { awakeMib: 8192, maxMib: 16_384, awakeVcpus: 4, maxVcpus: 16, budgetMib: 1_048_576, nixAwakeMib: 0, keptMib: 0 };
  expect([loadImpRoom(ctx.db, { budgetSlots: 2, impMib: 2048 }), loadImpRoom(ctx.db, { budgetSlots: 6, impMib: 2048 })]).toStrictEqual([
    { slots: 2, heldBy: 'imp budget or provider quota', line },
    { slots: 4, heldBy: 'impd at line', line },
  ]);
  await ctx.seed.capacitySample({ at: '2026-10-16T00:55:00Z', nonnix_awake_mib: 8192, nonnix_awake_vcpus: 12 });
  expect([loadImpRoom(ctx.db, { budgetSlots: 6, impMib: 2048 }), loadImpRoom(setCapacityImpVcpus(ctx.db, '4'), { budgetSlots: 6, impMib: 2048 })]).toStrictEqual([
    { slots: 2, heldBy: 'impd at vCPU line', line: { ...line, awakeVcpus: 12 } },
    { slots: 1, heldBy: 'impd at vCPU line', line: { ...line, awakeVcpus: 12 } },
  ]);
});

test('it refuses 0 vCPUs for one more imp, so the vCPU line is always checked', () => {
  const ctx = setupTest();
  expect(() => setCapacitySetting(ctx.db, 'impVcpus', '0', 'kettle-bot')).toThrow('impVcpus must be more than 0');
  expect(setCapacitySetting(ctx.db, 'nonnixMaxVcpus', '0', 'kettle-bot').nonnixMaxVcpus).toBe(0);
});

test('it takes both lines from the capacity watch\'s settings, their overrides included', async () => {
  const ctx = setupTest();
  await ctx.seed.capacitySample({ at: '2026-10-16T00:55:00Z', nonnix_awake_mib: 16_384, nonnix_awake_vcpus: 16 });
  const size = { budgetSlots: 4, impMib: 2048 };
  expect(loadImpRoom(ctx.db, size).slots).toBe(0);
  setCapacitySetting(ctx.db, 'nonnixMaxMib', '20480', 'kettle-bot');
  expect(loadImpRoom(ctx.db, size)).toMatchObject({ slots: 0, heldBy: 'impd at vCPU line' });
  setCapacitySetting(ctx.db, 'nonnixMaxVcpus', '20', 'kettle-bot');
  expect(loadImpRoom(ctx.db, size)).toStrictEqual({ slots: 2, heldBy: 'impd at line', line: { awakeMib: 16_384, maxMib: 20_480, awakeVcpus: 16, maxVcpus: 20, budgetMib: 1_048_576, nixAwakeMib: 0, keptMib: 0 } });
});

test('it holds every slot when there is no sample', () => {
  const ctx = setupTest();

  expect(loadImpRoom(ctx.db, { budgetSlots: 4, impMib: 2048 })).toStrictEqual({ slots: 0, heldBy: 'no fresh impd reading', line: null });
});

test.each([
  { title: 'a sample with no memory reading', samples: [{ at: '2026-10-16T00:55:00Z', nonnix_awake_mib: null }] },
  { title: 'a sample with no vCPU reading', samples: [{ at: '2026-10-16T00:55:00Z', nonnix_awake_mib: 0, nonnix_awake_vcpus: null }] },
  { title: 'a sample over 15 min old', samples: [{ at: '2026-10-16T00:44:00Z', nonnix_awake_mib: 0 }] },
  { title: 'a sample over 15 min old beside a later one not read yet', samples: [{ at: '2026-10-16T00:44:00Z', nonnix_awake_mib: 0 }, { at: '2026-10-16T01:01:00Z', nonnix_awake_mib: 0 }] },
])('it holds every slot for $title', async (row) => {
  const ctx = setupTest();
  for (const sample of row.samples) {
    await ctx.seed.capacitySample(sample);
  }

  expect(loadImpRoom(ctx.db, { budgetSlots: 4, impMib: 2048 })).toStrictEqual({ slots: 0, heldBy: 'no fresh impd reading', line: null });
});

test.each([
  { keptMib: 3072, slots: 1, heldBy: 'impd priority reservation' },
  { keptMib: 0, slots: 2, heldBy: 'impd at budget' },
])('it holds the slots past the impd budget less the $keptMib MiB kept for priority imps, named $heldBy', async (row) => {
  const ctx = setupTest();
  await ctx.seed.capacitySample({ at: '2026-10-16T00:55:00Z', nonnix_awake_mib: 14_336, nix_awake_mib: 1024, impd_budget_mib: 20_480, impd_priority_kept_mib: row.keptMib });
  setCapacitySetting(ctx.db, 'nonnixMaxMib', '20480', 'kettle-bot');

  const room = loadImpRoom(ctx.db, { budgetSlots: 6, impMib: 2048 });

  expect(room).toStrictEqual({ slots: row.slots, heldBy: row.heldBy, line: { awakeMib: 14_336, maxMib: 20_480, awakeVcpus: 0, maxVcpus: 16, budgetMib: 20_480, nixAwakeMib: 1024, keptMib: row.keptMib } });
});

test.each([
  { field: 'nixAwakeMib', seed: { nix_awake_mib: null } },
  { field: 'impdBudgetMib', seed: { impd_budget_mib: null } },
  { field: 'impdPriorityKeptMib', seed: { impd_priority_kept_mib: null } },
])('it holds every slot when the sample has no $field reading', async (row) => {
  const ctx = setupTest();
  await ctx.seed.capacitySample({ at: '2026-10-16T00:55:00Z', nonnix_awake_mib: 8192, ...row.seed });

  const room = loadImpRoom(ctx.db, { budgetSlots: 4, impMib: 2048 });

  expect(room).toStrictEqual({ slots: 0, heldBy: 'no fresh impd reading', line: null });
});

test('it names the non-Nix line, not the RAM kept for priority imps, when the line is the tighter', async () => {
  const ctx = setupTest();
  await ctx.seed.capacitySample({ at: '2026-10-16T00:55:00Z', nonnix_awake_mib: 14_336, nix_awake_mib: 0, impd_budget_mib: 20_480, impd_priority_kept_mib: 1024 });

  const room = loadImpRoom(ctx.db, { budgetSlots: 6, impMib: 2048 });

  expect([room.slots, room.heldBy]).toStrictEqual([1, 'impd at line']);
});

test.each([
  { committedMib: null, slots: 1 },
  { committedMib: 12_288, slots: 1 },
  { committedMib: 14_336, slots: 0 },
])('it leaves $slots slot(s) when impd has $committedMib MiB committed and 12288 MiB awake', (row) => {
  const line = { awakeMib: 12_288, maxMib: 20_480, awakeVcpus: 0, maxVcpus: 16, budgetMib: 20_480, nixAwakeMib: 0, keptMib: 6144 };

  const room = buildLineRoom(line, { budgetSlots: 6, impMib: 2048, impVcpus: 1 }, row.committedMib);

  expect(room.slots).toBe(row.slots);
});

test('it takes the last slot away when impd has more committed than awake, from a stored sample', async () => {
  const ctx = setupTest();
  await ctx.seed.capacitySample({ at: '2026-10-16T00:55:00Z', nonnix_awake_mib: 12_288, nix_awake_mib: 0, impd_budget_mib: 20_480, impd_priority_kept_mib: 6144, impd_committed_mib: 14_336 });
  setCapacitySetting(ctx.db, 'nonnixMaxMib', '20480', 'kettle-bot');

  const room = loadImpRoom(ctx.db, { budgetSlots: 6, impMib: 2048 });

  expect(room.slots).toBe(0);
});

test('it replaces the stored sample with a live reading for the room', async () => {
  const ctx = setupTest();
  await ctx.seed.capacitySample({ at: '2026-10-16T00:55:00Z', nonnix_awake_mib: 12_288, nix_awake_mib: 0, impd_budget_mib: 20_480, impd_priority_kept_mib: 6144 });
  setCapacitySetting(ctx.db, 'nonnixMaxMib', '20480', 'kettle-bot');
  const woken = { budgetMib: 20_480, usedMib: 14_336, committedMib: 14_336, nonnixAwakeMib: 14_336, nonnixAwakeVcpus: 4, nixAwakeMib: 0, priorityKeptMib: 6144 };

  const rooms = [loadImpRoom(ctx.db, { budgetSlots: 6, impMib: 2048 }), loadImpRoom(ctx.db, { budgetSlots: 6, impMib: 2048 }, new Date('2026-10-16T01:00:00Z'), woken)];

  expect(rooms.map((room) => room.slots)).toStrictEqual([1, 0]);
});

test('it falls back to the stored sample when a live reading has a missing figure', async () => {
  const ctx = setupTest();
  await ctx.seed.capacitySample({ at: '2026-10-16T00:55:00Z', nonnix_awake_mib: 12_288, nix_awake_mib: 0, impd_budget_mib: 20_480, impd_priority_kept_mib: 6144 });
  setCapacitySetting(ctx.db, 'nonnixMaxMib', '20480', 'kettle-bot');
  const partial = { budgetMib: 20_480, usedMib: 14_336, committedMib: 14_336, nonnixAwakeMib: null, nonnixAwakeVcpus: null, nixAwakeMib: null, priorityKeptMib: 6144 };

  const room = loadImpRoom(ctx.db, { budgetSlots: 6, impMib: 2048 }, new Date('2026-10-16T01:00:00Z'), partial);

  expect(room.slots).toBe(1);
});

test('it does not hold a live reading for a stored sample over 15 min old', async () => {
  const ctx = setupTest();
  await ctx.seed.capacitySample({ at: '2026-10-16T00:30:00Z', nonnix_awake_mib: 0 });
  const live = { budgetMib: 20_480, usedMib: 0, committedMib: 0, nonnixAwakeMib: 0, nonnixAwakeVcpus: 0, nixAwakeMib: 0, priorityKeptMib: 0 };

  const room = loadImpRoom(ctx.db, { budgetSlots: 2, impMib: 2048 }, new Date('2026-10-16T01:00:00Z'), live);

  expect(room.slots).toBe(2);
});

function setCapacityImpVcpus(db: Database, vcpus: string): Database {
  setCapacitySetting(db, 'impVcpus', vcpus, 'kettle-bot');
  return db;
}
