import { expect, test } from 'bun:test';
import { pickBackfillStart } from './pick-backfill-start.ts';

test.each([
  { name: 'a session added to a run that started an hour ago', attach: 'session-add' as const, createdAt: '2026-10-14T00:00:00Z', expected: '2026-10-14T00:00:00.000Z' },
  { name: 'a session added to a run that started three days ago', attach: 'session-add' as const, createdAt: '2026-10-11T01:00:00Z', expected: '2026-10-13T01:00:00.000Z' },
  { name: 'a session given to a run hq run add just created', attach: 'run-add' as const, createdAt: '2026-10-14T01:00:00Z', expected: '2026-10-13T01:00:00.000Z' },
])('it starts at $expected for $name', (row) => {
  const start = pickBackfillStart(row.attach, row.createdAt, Date.parse('2026-10-14T01:00:00Z'));

  expect(new Date(start).toISOString()).toBe(row.expected);
});
