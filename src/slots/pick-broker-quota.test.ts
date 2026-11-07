import { expect, test } from 'bun:test';
import { buildMockSlotRow } from '../../test/build-mock-slot-row.ts';
import { pickBrokerQuota } from './pick-broker-quota.ts';

test('it says none when no broker slot is recorded', () => {
  const rows = [buildMockSlotRow({ at: '2026-10-20T05:00:00Z' })];

  expect(pickBrokerQuota(null, rows, null, new Date('2026-10-20T06:00:00Z'))).toStrictEqual({ state: 'none', why: 'no imp broker slot recorded: hq slots broker <n> --proof <id>' });
});

test("it reads the fuller window of the broker slot's newest good read, and skips other slots", () => {
  const record = { slot: 1, proof: 'spawn-7f3a', note: null, at: '2026-10-20T03:00:00Z', by: 'z-release' };
  const rows = [
    buildMockSlotRow({ at: '2026-10-20T04:00:00Z', five: 10, seven: 20 }),
    buildMockSlotRow({ at: '2026-10-20T05:00:00Z', slot: 3, five: 99, seven: 99 }),
    buildMockSlotRow({ at: '2026-10-20T05:00:00Z', five: 55, fiveResetsAt: '2026-10-20T08:00:00Z', seven: 30 }),
  ];

  expect(pickBrokerQuota(record, rows, null, new Date('2026-10-20T06:00:00Z'))).toStrictEqual({ state: 'read', slot: 1, proof: 'spawn-7f3a', proofAgeHours: 3, from: 'slot-read', used: 55, resetsAt: '2026-10-20T08:00:00Z', readAt: '2026-10-20T05:00:00Z' });
});

test('it gives unknown with room while the proof is under 24 h old and no read is fresh', () => {
  const record = { slot: 1, proof: 'req-0001', note: null, at: '2026-10-20T03:00:00Z', by: 'z-release' };
  const rows = [buildMockSlotRow({ at: '2026-10-20T03:00:00Z' }), buildMockSlotRow({ at: '2026-10-20T05:00:00Z', status: 'request-failed' })];

  expect(pickBrokerQuota(record, rows, null, new Date('2026-10-20T06:00:00Z'))).toStrictEqual({ state: 'unknown-proved', slot: 1, proof: 'req-0001', proofAgeHours: 3, why: "no slot read of the imp broker's slot 1 in the last 2.5 h" });
});

test('it gives unknown with no room once the proof is 24 h old', () => {
  const record = { slot: 2, proof: 'req-0002', note: 'moved after the slot 1 reset', at: '2026-10-19T00:00:00Z', by: 'z-release' };

  expect(pickBrokerQuota(record, [], null, new Date('2026-10-20T06:00:00Z'))).toStrictEqual({ state: 'unknown', slot: 2, proof: 'req-0002', proofAgeHours: 30, why: "no slot read of the imp broker's slot 2 in the last 2.5 h, and its proof is 30 h old" });
});

test('it treats a good read with neither window as unknown', () => {
  const record = { slot: 1, proof: 'req-0003', note: null, at: '2026-10-20T05:00:00Z', by: 'z-release' };
  const rows = [buildMockSlotRow({ at: '2026-10-20T05:30:00Z', five: null, seven: null })];

  expect(pickBrokerQuota(record, rows, null, new Date('2026-10-20T06:00:00Z')).state).toBe('unknown-proved');
});

test.each([
  {
    name: "a newer login sample is on the broker slot's account",
    rows: [buildMockSlotRow({ at: '2026-11-07T12:17:48Z', slot: 2, five: 20, seven: 91, sevenResetsAt: '2026-11-12T00:00:00Z' })],
    sample: { at: '2026-11-07T13:28:43Z', five: 30, fiveResetsAt: '2026-11-07T16:00:00Z', seven: 98, sevenResetsAt: '2026-11-12T00:00:30Z' },
    expected: { state: 'read', slot: 2, proof: 'req-9b0c', proofAgeHours: 3.7, from: 'login-sample', used: 98, resetsAt: '2026-11-12T00:00:30Z', readAt: '2026-11-07T13:28:43Z' },
  },
  {
    name: 'the login sample is older than the slot read',
    rows: [buildMockSlotRow({ at: '2026-11-07T12:17:48Z', slot: 2, five: 20, seven: 91, sevenResetsAt: '2026-11-12T00:00:00Z' })],
    sample: { at: '2026-11-07T12:00:00Z', five: 30, fiveResetsAt: '2026-11-07T16:00:00Z', seven: 98, sevenResetsAt: '2026-11-12T00:00:00Z' },
    expected: { state: 'read', slot: 2, proof: 'req-9b0c', proofAgeHours: 3.7, from: 'slot-read', used: 91, resetsAt: '2026-11-12T00:00:00Z', readAt: '2026-11-07T12:17:48Z' },
  },
  {
    name: "the login sample carries another account's 7-day reset",
    rows: [buildMockSlotRow({ at: '2026-11-07T12:17:48Z', slot: 2, five: 20, seven: 91, sevenResetsAt: '2026-11-12T00:00:00Z' })],
    sample: { at: '2026-11-07T13:28:43Z', five: 30, fiveResetsAt: '2026-11-07T16:00:00Z', seven: 99, sevenResetsAt: '2026-11-10T00:00:00Z' },
    expected: { state: 'read', slot: 2, proof: 'req-9b0c', proofAgeHours: 3.7, from: 'slot-read', used: 91, resetsAt: '2026-11-12T00:00:00Z', readAt: '2026-11-07T12:17:48Z' },
  },
  {
    name: "no slot read is fresh but a fresh login sample matches the last slot row's reset",
    rows: [buildMockSlotRow({ at: '2026-11-07T10:50:00Z', slot: 2, five: 20, seven: 91, sevenResetsAt: '2026-11-12T00:00:00Z' })],
    sample: { at: '2026-11-07T13:28:43Z', five: 30, fiveResetsAt: '2026-11-07T16:00:00Z', seven: 98, sevenResetsAt: '2026-11-12T00:00:00Z' },
    expected: { state: 'read', slot: 2, proof: 'req-9b0c', proofAgeHours: 3.7, from: 'login-sample', used: 98, resetsAt: '2026-11-12T00:00:00Z', readAt: '2026-11-07T13:28:43Z' },
  },
  {
    name: 'no slot read is fresh and the login sample is stale',
    rows: [buildMockSlotRow({ at: '2026-11-07T10:50:00Z', slot: 2, five: 20, seven: 91, sevenResetsAt: '2026-11-12T00:00:00Z' })],
    sample: { at: '2026-11-07T10:55:00Z', five: 30, fiveResetsAt: '2026-11-07T16:00:00Z', seven: 98, sevenResetsAt: '2026-11-12T00:00:00Z' },
    expected: { state: 'unknown-proved', slot: 2, proof: 'req-9b0c', proofAgeHours: 3.7, why: "no slot read of the imp broker's slot 2 in the last 2.5 h" },
  },
  {
    name: 'no slot row gives a 7-day reset to match the login sample',
    rows: [],
    sample: { at: '2026-11-07T13:28:43Z', five: 30, fiveResetsAt: '2026-11-07T16:00:00Z', seven: 98, sevenResetsAt: '2026-11-12T00:00:00Z' },
    expected: { state: 'unknown-proved', slot: 2, proof: 'req-9b0c', proofAgeHours: 3.7, why: "no slot read of the imp broker's slot 2 in the last 2.5 h" },
  },
])('it takes the login sample only when it is fresh, newer and on the broker account: $name', (row) => {
  const record = { slot: 2, proof: 'req-9b0c', note: null, at: '2026-11-07T10:00:00Z', by: 'z-release' };

  expect(pickBrokerQuota(record, row.rows, row.sample, new Date('2026-11-07T13:40:00Z'))).toStrictEqual(row.expected);
});
