import { expect, test } from 'bun:test';
import { buildMockSlotRow } from '../../test/build-mock-slot-row.ts';
import { pickBrokerQuota } from './pick-broker-quota.ts';

test('it says none when no broker slot is recorded', () => {
  const rows = [buildMockSlotRow({ at: '2026-10-20T05:00:00Z' })];

  expect(pickBrokerQuota(null, rows, new Date('2026-10-20T06:00:00Z'))).toStrictEqual({ state: 'none', why: 'no imp broker slot recorded: hq slots broker <n> --proof <id>' });
});

test("it reads the fuller window of the broker slot's newest good read, and skips other slots", () => {
  const record = { slot: 1, proof: 'spawn-7f3a', note: null, at: '2026-10-20T03:00:00Z', by: 'z-release' };
  const rows = [
    buildMockSlotRow({ at: '2026-10-20T04:00:00Z', five: 10, seven: 20 }),
    buildMockSlotRow({ at: '2026-10-20T05:00:00Z', slot: 3, five: 99, seven: 99 }),
    buildMockSlotRow({ at: '2026-10-20T05:00:00Z', five: 55, fiveResetsAt: '2026-10-20T08:00:00Z', seven: 30 }),
  ];

  expect(pickBrokerQuota(record, rows, new Date('2026-10-20T06:00:00Z'))).toStrictEqual({ state: 'read', slot: 1, proof: 'spawn-7f3a', proofAgeHours: 3, used: 55, resetsAt: '2026-10-20T08:00:00Z', readAt: '2026-10-20T05:00:00Z' });
});

test('it gives unknown with room while the proof is under 24 h old and no read is fresh', () => {
  const record = { slot: 1, proof: 'req-0001', note: null, at: '2026-10-20T03:00:00Z', by: 'z-release' };
  const rows = [buildMockSlotRow({ at: '2026-10-20T03:00:00Z' }), buildMockSlotRow({ at: '2026-10-20T05:00:00Z', status: 'request-failed' })];

  expect(pickBrokerQuota(record, rows, new Date('2026-10-20T06:00:00Z'))).toStrictEqual({ state: 'unknown-proved', slot: 1, proof: 'req-0001', proofAgeHours: 3, why: "no slot read of the imp broker's slot 1 in the last 2.5 h" });
});

test('it gives unknown with no room once the proof is 24 h old', () => {
  const record = { slot: 2, proof: 'req-0002', note: 'moved after the slot 1 reset', at: '2026-10-19T00:00:00Z', by: 'z-release' };

  expect(pickBrokerQuota(record, [], new Date('2026-10-20T06:00:00Z'))).toStrictEqual({ state: 'unknown', slot: 2, proof: 'req-0002', proofAgeHours: 30, why: "no slot read of the imp broker's slot 2 in the last 2.5 h, and its proof is 30 h old" });
});

test('it treats a good read with neither window as unknown', () => {
  const record = { slot: 1, proof: 'req-0003', note: null, at: '2026-10-20T05:00:00Z', by: 'z-release' };
  const rows = [buildMockSlotRow({ at: '2026-10-20T05:30:00Z', five: null, seven: null })];

  expect(pickBrokerQuota(record, rows, new Date('2026-10-20T06:00:00Z')).state).toBe('unknown-proved');
});
