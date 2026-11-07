import { expect, test } from 'bun:test';
import { pickClaudeReading } from './pick-claude-reading.ts';

test('it gives a fresh read as a used percent with its source', () => {
  const reading = pickClaudeReading({ state: 'read', slot: 1, proof: 'req-4c1d', proofAgeHours: 5, from: 'slot-read', used: 40, resetsAt: '2026-10-16T04:00:00Z', readAt: '2026-10-15T23:00:00Z' });

  expect(reading).toStrictEqual({ slot: 1, proof: 'req-4c1d', proofAgeHours: 5, used: 40, resetsAt: '2026-10-16T04:00:00Z', source: 'hq slot read of the imp broker slot 1, 2026-10-15T23:00:00Z' });
});

test("it names this machine's login sample as the source of a reading taken from it", () => {
  const reading = pickClaudeReading({ state: 'read', slot: 2, proof: 'req-9b0c', proofAgeHours: 4, from: 'login-sample', used: 98, resetsAt: '2026-11-12T00:00:00Z', readAt: '2026-11-07T13:28:43Z' });

  expect(reading).toStrictEqual({ slot: 2, proof: 'req-9b0c', proofAgeHours: 4, used: 98, resetsAt: '2026-11-12T00:00:00Z', source: "hq login sample on the imp broker slot 2's account, 2026-11-07T13:28:43Z" });
});

test('it marks an unknown quota with a young proof as unknown, with no used percent', () => {
  const reading = pickClaudeReading({ state: 'unknown-proved', slot: 1, proof: 'req-4c1d', proofAgeHours: 3, why: 'no slot read' });

  expect(reading).toStrictEqual({ slot: 1, proof: 'req-4c1d', proofAgeHours: 3, used: null, unknown: true, why: 'no slot read', source: 'hq capacity broker' });
});

test('it gives an error for an unknown quota with an old proof', () => {
  const reading = pickClaudeReading({ state: 'unknown', slot: 2, proof: 'req-0002', proofAgeHours: 30, why: 'no slot read, and its proof is 30 h old' });

  expect(reading).toStrictEqual({ error: 'imp broker quota unknown: no slot read, and its proof is 30 h old' });
});

test('it gives an error when no broker slot is recorded', () => {
  const reading = pickClaudeReading({ state: 'none', why: 'no imp broker slot recorded' });

  expect(reading).toStrictEqual({ error: 'imp broker quota unknown: no imp broker slot recorded' });
});
