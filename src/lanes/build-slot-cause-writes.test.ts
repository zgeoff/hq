import { expect, test } from 'bun:test';
import { buildSlotCauseWrites } from './build-slot-cause-writes.ts';

test('it keeps the Ready-waiting clock and the stored cause when the capacity read failed', () => {
  const writes = buildSlotCauseWrites(
    {
      free: 0,
      unfit: 0,
      eligible: null,
      eligibleSince: '2026-10-14T00:55:00Z',
      readyAt: '2026-10-14T00:58:00Z',
      promotable: null,
      focus: '[]',
      causeSince: { cause: 'delivery', since: '2026-10-14T00:40:00Z' },
      freshMinutes: 30,
      at: new Date('2026-10-14T01:00:00Z'),
    },
    false,
  );

  expect(writes).toStrictEqual({ eligibleSince: '2026-10-14T00:55:00Z', move: null, slotCause: { cause: null, slots: 0, since: null, readyAgeMinutes: 2, reason: null, waitingMinutes: null, backlogError: null } });
});

test('it clears the Ready-waiting clock and ends the stored cause when no slot is free', () => {
  const writes = buildSlotCauseWrites(
    {
      free: 0,
      unfit: 0,
      eligible: 2,
      eligibleSince: '2026-10-14T00:55:00Z',
      readyAt: '2026-10-14T00:58:00Z',
      promotable: null,
      focus: '[]',
      causeSince: { cause: 'delivery', since: '2026-10-14T00:40:00Z' },
      freshMinutes: 30,
      at: new Date('2026-10-14T01:00:00Z'),
    },
    true,
  );

  expect(writes).toStrictEqual({ eligibleSince: null, move: { action: 'cause-ended', to: 'none' }, slotCause: { cause: null, slots: 0, since: null, readyAgeMinutes: 2, reason: null, waitingMinutes: null, backlogError: null } });
});

test('it clears the Ready-waiting clock when no Ready issue is eligible', () => {
  const writes = buildSlotCauseWrites(
    {
      free: 2,
      unfit: 0,
      eligible: 0,
      eligibleSince: '2026-10-14T00:55:00Z',
      readyAt: '2026-10-14T00:58:00Z',
      promotable: { at: '2026-10-14T00:58:00Z', count: 0, focus: '[]', error: null },
      focus: '[]',
      causeSince: { cause: 'supply', since: '2026-10-14T00:40:00Z' },
      freshMinutes: 30,
      at: new Date('2026-10-14T01:00:00Z'),
    },
    true,
  );

  expect(writes.eligibleSince).toBeNull();
});

test('it starts the Ready-waiting clock at the look when eligible Ready work first meets a free slot, and tags no cause yet', () => {
  const writes = buildSlotCauseWrites(
    {
      free: 2,
      unfit: 0,
      eligible: 1,
      eligibleSince: null,
      readyAt: '2026-10-14T00:58:00Z',
      promotable: null,
      focus: '[]',
      causeSince: null,
      freshMinutes: 30,
      at: new Date('2026-10-14T01:00:00Z'),
    },
    true,
  );

  expect(writes).toStrictEqual({ eligibleSince: '2026-10-14T01:00:00Z', move: null, slotCause: { cause: null, slots: 2, since: '2026-10-14T01:00:00Z', readyAgeMinutes: 2, reason: null, waitingMinutes: 0, backlogError: null } });
});

test('it begins a cause at the look when none was stored', () => {
  const writes = buildSlotCauseWrites(
    {
      free: 2,
      unfit: 0,
      eligible: 0,
      eligibleSince: null,
      readyAt: '2026-10-14T00:58:00Z',
      promotable: { at: '2026-10-14T00:58:00Z', count: 3, focus: '[]', error: null },
      focus: '[]',
      causeSince: null,
      freshMinutes: 30,
      at: new Date('2026-10-14T01:00:00Z'),
    },
    true,
  );

  expect(writes).toStrictEqual({ eligibleSince: null, move: { action: 'cause-began', to: 'triage' }, slotCause: { cause: 'triage', slots: 2, since: '2026-10-14T01:00:00Z', readyAgeMinutes: 2, reason: null, waitingMinutes: null, backlogError: null } });
});

test('it changes the stored cause at the look when the look finds another', () => {
  const writes = buildSlotCauseWrites(
    {
      free: 2,
      unfit: 0,
      eligible: 0,
      eligibleSince: null,
      readyAt: '2026-10-14T00:58:00Z',
      promotable: { at: '2026-10-14T00:58:00Z', count: 0, focus: '[]', error: null },
      focus: '[]',
      causeSince: { cause: 'triage', since: '2026-10-14T00:40:00Z' },
      freshMinutes: 30,
      at: new Date('2026-10-14T01:00:00Z'),
    },
    true,
  );

  expect(writes).toStrictEqual({ eligibleSince: null, move: { action: 'cause-changed', to: 'supply' }, slotCause: { cause: 'supply', slots: 2, since: '2026-10-14T01:00:00Z', readyAgeMinutes: 2, reason: null, waitingMinutes: null, backlogError: null } });
});

test('it writes no move and keeps the stored start when the look finds the stored cause', () => {
  const writes = buildSlotCauseWrites(
    {
      free: 2,
      unfit: 0,
      eligible: 0,
      eligibleSince: null,
      readyAt: '2026-10-14T00:58:00Z',
      promotable: { at: '2026-10-14T00:58:00Z', count: 3, focus: '[]', error: null },
      focus: '[]',
      causeSince: { cause: 'triage', since: '2026-10-14T00:40:00Z' },
      freshMinutes: 30,
      at: new Date('2026-10-14T01:00:00Z'),
    },
    true,
  );

  expect(writes).toStrictEqual({ eligibleSince: null, move: null, slotCause: { cause: 'triage', slots: 2, since: '2026-10-14T00:40:00Z', readyAgeMinutes: 2, reason: null, waitingMinutes: null, backlogError: null } });
});

test('it ends the stored cause when eligible Ready work is still inside its grace time', () => {
  const writes = buildSlotCauseWrites(
    {
      free: 2,
      unfit: 0,
      eligible: 1,
      eligibleSince: '2026-10-14T00:55:00Z',
      readyAt: '2026-10-14T00:58:00Z',
      promotable: null,
      focus: '[]',
      causeSince: { cause: 'supply', since: '2026-10-14T00:40:00Z' },
      freshMinutes: 30,
      at: new Date('2026-10-14T01:00:00Z'),
    },
    true,
  );

  expect(writes.move).toStrictEqual({ action: 'cause-ended', to: 'none' });
});

test('it writes no move when no cause holds and none was stored', () => {
  const writes = buildSlotCauseWrites(
    {
      free: 0,
      unfit: 0,
      eligible: 2,
      eligibleSince: null,
      readyAt: '2026-10-14T00:58:00Z',
      promotable: null,
      focus: '[]',
      causeSince: null,
      freshMinutes: 30,
      at: new Date('2026-10-14T01:00:00Z'),
    },
    true,
  );

  expect(writes.move).toBeNull();
});

test('it clears the Ready-waiting clock while no eligible issue fits a free slot, so a fitting issue later gets the grace', () => {
  const writes = buildSlotCauseWrites(
    {
      free: 1,
      unfit: 1,
      eligible: 2,
      eligibleSince: '2026-10-14T00:20:00Z',
      readyAt: '2026-10-14T00:58:00Z',
      promotable: null,
      focus: '[]',
      causeSince: null,
      freshMinutes: 30,
      at: new Date('2026-10-14T01:00:00Z'),
    },
    true,
  );

  expect(writes).toStrictEqual({ eligibleSince: null, move: { action: 'cause-began', to: 'supply' }, slotCause: { cause: 'supply', slots: 1, since: '2026-10-14T01:00:00Z', readyAgeMinutes: 2, reason: null, waitingMinutes: null, backlogError: null } });
});
