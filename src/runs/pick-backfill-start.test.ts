import { expect, test } from 'bun:test';
import { pickBackfillStart } from './pick-backfill-start.ts';

test.each([
  { name: 'a run that started an hour ago', createdAt: '2026-10-14T00:00:00Z', expected: '2026-10-14T00:00:00.000Z' },
  { name: 'a run that started three days ago', createdAt: '2026-10-11T01:00:00Z', expected: '2026-10-13T01:00:00.000Z' },
])('it starts at $expected for $name', (row) => {
  const start = pickBackfillStart(row.createdAt, Date.parse('2026-10-14T01:00:00Z'));

  expect(new Date(start).toISOString()).toBe(row.expected);
});
