import { expect, test } from 'bun:test';
import { pickClaudeReading } from './pick-claude-reading.ts';

test('it gives a fresh read as a used percent with its source', () => {
  const reading = pickClaudeReading({ state: 'read', slot: 1, proof: 'req-4c1d', proofAgeHours: 5, used: 40, resetsAt: '2026-10-16T04:00:00Z', readAt: '2026-10-15T23:00:00Z' });

  expect(reading).toStrictEqual({ slot: 1, proof: 'req-4c1d', proofAgeHours: 5, used: 40, resetsAt: '2026-10-16T04:00:00Z', source: 'hq slot read of the imp broker slot 1, 2026-10-15T23:00:00Z' });
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
