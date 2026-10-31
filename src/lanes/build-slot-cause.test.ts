import { expect, test } from 'bun:test';
import { buildSlotCause } from './build-slot-cause.ts';

test('it names a stale Ready read as the reason when the snapshot is 30 min 30 s old', () => {
  const slotCause = buildSlotCause({
    free: 2,
    unfit: 0,
    eligible: null,
    eligibleSince: null,
    readyAt: '2026-10-14T00:29:30Z',
    promotable: { at: '2026-10-14T00:55:00Z', count: 3, focus: '[]', error: null },
    causeSince: null,
    focus: '[]',
    freshMinutes: 30,
    at: new Date('2026-10-14T01:00:00Z'),
  });

  expect(slotCause).toStrictEqual({ cause: 'unknown', slots: 2, since: null, readyAgeMinutes: 30, reason: 'ready_stale', waitingMinutes: null, backlogError: null });
});

test('it names a Ready read that never ran as the reason when no snapshot exists', () => {
  const slotCause = buildSlotCause({
    free: 2,
    unfit: 0,
    eligible: null,
    eligibleSince: null,
    readyAt: null,
    promotable: { at: '2026-10-14T00:55:00Z', count: 3, focus: '[]', error: null },
    causeSince: null,
    focus: '[]',
    freshMinutes: 30,
    at: new Date('2026-10-14T01:00:00Z'),
  });

  expect(slotCause).toStrictEqual({ cause: 'unknown', slots: 2, since: null, readyAgeMinutes: null, reason: 'ready_never_read', waitingMinutes: null, backlogError: null });
});

test('it names an unknown Backlog count as the reason, with the read\'s error, when the count failed', () => {
  const slotCause = buildSlotCause({
    free: 2,
    unfit: 0,
    eligible: 0,
    eligibleSince: null,
    readyAt: '2026-10-14T00:55:00Z',
    promotable: { at: '2026-10-14T00:55:00Z', count: null, focus: '[]', error: 'Linear answered 502: invented outage' },
    causeSince: null,
    focus: '[]',
    freshMinutes: 30,
    at: new Date('2026-10-14T01:00:00Z'),
  });

  expect(slotCause).toStrictEqual({ cause: 'unknown', slots: 2, since: null, readyAgeMinutes: 5, reason: 'backlog_unknown', waitingMinutes: null, backlogError: 'Linear answered 502: invented outage' });
});

test('it names a stale Backlog count as the reason when the count is older than the fresh time', () => {
  const slotCause = buildSlotCause({
    free: 2,
    unfit: 0,
    eligible: 0,
    eligibleSince: null,
    readyAt: '2026-10-14T00:55:00Z',
    promotable: { at: '2026-10-14T00:29:30Z', count: 3, focus: '[]', error: null },
    causeSince: null,
    focus: '[]',
    freshMinutes: 30,
    at: new Date('2026-10-14T01:00:00Z'),
  });

  expect(slotCause).toStrictEqual({ cause: 'unknown', slots: 2, since: null, readyAgeMinutes: 5, reason: 'backlog_stale', waitingMinutes: null, backlogError: null });
});

test('it tags delivery once Ready work has waited 10 min 30 s beside a free slot', () => {
  const slotCause = buildSlotCause({
    free: 2,
    unfit: 0,
    eligible: 1,
    eligibleSince: '2026-10-14T00:49:30Z',
    readyAt: '2026-10-14T00:55:00Z',
    promotable: null,
    causeSince: null,
    focus: '[]',
    freshMinutes: 30,
    at: new Date('2026-10-14T01:00:00Z'),
  });

  expect(slotCause).toStrictEqual({ cause: 'delivery', slots: 2, since: null, readyAgeMinutes: 5, reason: null, waitingMinutes: null, backlogError: null });
});

test('it names a Backlog count made for an earlier focus as the reason when the focus has changed', () => {
  const slotCause = buildSlotCause({
    free: 2,
    unfit: 0,
    eligible: 0,
    eligibleSince: null,
    readyAt: '2026-10-14T00:55:00Z',
    promotable: { at: '2026-10-14T00:55:00Z', count: 3, focus: '["bug"]', error: null },
    causeSince: null,
    focus: '["roadmap"]',
    freshMinutes: 30,
    at: new Date('2026-10-14T01:00:00Z'),
  });

  expect(slotCause).toStrictEqual({ cause: 'unknown', slots: 2, since: null, readyAgeMinutes: 5, reason: 'backlog_focus_changed', waitingMinutes: null, backlogError: null });
});

test('it names supply when every free slot sits at a place no eligible issue fits', () => {
  const slotCause = buildSlotCause({
    free: 1,
    unfit: 1,
    eligible: 2,
    eligibleSince: '2026-10-14T00:00:00Z',
    readyAt: '2026-10-14T00:55:00Z',
    promotable: null,
    causeSince: null,
    focus: '[]',
    freshMinutes: 30,
    at: new Date('2026-10-14T01:00:00Z'),
  });

  expect(slotCause).toStrictEqual({ cause: 'supply', slots: 1, since: null, readyAgeMinutes: 5, reason: null, waitingMinutes: null, backlogError: null });
});

test('it counts only the free slots an eligible issue fits as empty delivery slots', () => {
  const slotCause = buildSlotCause({
    free: 3,
    unfit: 1,
    eligible: 2,
    eligibleSince: '2026-10-14T00:00:00Z',
    readyAt: '2026-10-14T00:55:00Z',
    promotable: null,
    causeSince: null,
    focus: '[]',
    freshMinutes: 30,
    at: new Date('2026-10-14T01:00:00Z'),
  });

  expect(slotCause).toStrictEqual({ cause: 'delivery', slots: 2, since: null, readyAgeMinutes: 5, reason: null, waitingMinutes: null, backlogError: null });
});
