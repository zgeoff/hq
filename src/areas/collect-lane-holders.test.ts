import { expect, test } from 'bun:test';
import { collectLaneHolders } from './collect-lane-holders.ts';
import type { AwakeReading } from './read-fresh-awake.ts';

const reading: AwakeReading = { at: '2026-10-15T20:00:00Z', ids: ['a0000501-aaaa-4aaa-8aaa-aaaaaaaaaaaa'], idle: {}, seen: ['a0000501-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a0000502-aaaa-4aaa-8aaa-aaaaaaaaaaaa'] };
const at = new Date('2026-10-15T20:10:00Z');

test.each([
  { title: 'holds an awake and busy session', row: { added_at: '2026-10-15T19:00:00Z' }, idle: {}, holds: true },
  { title: 'holds an awake session idle for 14 minutes', row: { added_at: '2026-10-15T19:00:00Z' }, idle: { 'a0000501-aaaa-4aaa-8aaa-aaaaaaaaaaaa': '2026-10-15T19:56:00Z' }, holds: true },
  { title: 'frees an awake session idle for 16 minutes', row: { added_at: '2026-10-15T19:00:00Z' }, idle: { 'a0000501-aaaa-4aaa-8aaa-aaaaaaaaaaaa': '2026-10-15T19:54:00Z' }, holds: false },
])('it $title', ({ row, idle, holds }) => {
  const rows = [{ issue: 'GEO-501', session_id: 'a0000501-aaaa-4aaa-8aaa-aaaaaaaaaaaa', added_at: row.added_at }];

  expect(collectLaneHolders(rows, { ...reading, idle }, at)).toStrictEqual(holds ? rows : []);
});

test.each([
  { title: 'frees a session that is asleep and was added before the reading', addedAt: '2026-10-15T19:00:00Z', seen: ['a0000501-aaaa-4aaa-8aaa-aaaaaaaaaaaa'], holds: false },
  { title: 'holds a session added after the reading and not seen', addedAt: '2026-10-15T20:05:00Z', seen: ['a0000501-aaaa-4aaa-8aaa-aaaaaaaaaaaa'], holds: true },
  { title: 'frees a session added after the reading yet seen asleep', addedAt: '2026-10-15T20:05:00Z', seen: ['a0000502-aaaa-4aaa-8aaa-aaaaaaaaaaaa'], holds: false },
])('it $title', ({ addedAt, seen, holds }) => {
  const rows = [{ issue: 'GEO-502', session_id: 'a0000502-aaaa-4aaa-8aaa-aaaaaaaaaaaa', added_at: addedAt }];

  expect(collectLaneHolders(rows, { ...reading, seen }, at)).toStrictEqual(holds ? rows : []);
});

test('it holds a run with one asleep session and one busy session', () => {
  const rows = [
    { issue: 'GEO-503', session_id: 'a0000503-aaaa-4aaa-8aaa-aaaaaaaaaaaa', added_at: '2026-10-15T19:00:00Z' },
    { issue: 'GEO-503', session_id: 'a0000501-aaaa-4aaa-8aaa-aaaaaaaaaaaa', added_at: '2026-10-15T19:30:00Z' },
  ];

  expect(collectLaneHolders(rows, reading, at)).toStrictEqual([rows[1]]);
});
