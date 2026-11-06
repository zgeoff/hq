import { expect, test } from 'bun:test';
import { collectLaneHolders } from './collect-lane-holders.ts';

test.each([
  { title: 'holds an awake and busy session', ids: ['a0000501-aaaa-4aaa-8aaa-aaaaaaaaaaaa'], idle: {}, seen: [], addedAt: '2026-10-15T19:00:00Z', holds: true },
  { title: 'holds an awake session idle for 14 minutes', ids: ['a0000501-aaaa-4aaa-8aaa-aaaaaaaaaaaa'], idle: { 'a0000501-aaaa-4aaa-8aaa-aaaaaaaaaaaa': '2026-10-15T19:56:00Z' }, seen: [], addedAt: '2026-10-15T19:00:00Z', holds: true },
  { title: 'frees an awake session idle for 16 minutes', ids: ['a0000501-aaaa-4aaa-8aaa-aaaaaaaaaaaa'], idle: { 'a0000501-aaaa-4aaa-8aaa-aaaaaaaaaaaa': '2026-10-15T19:54:00Z' }, seen: [], addedAt: '2026-10-15T19:00:00Z', holds: false },
  { title: 'frees a session that is asleep and was added before the reading', ids: [], idle: {}, seen: ['a0000501-aaaa-4aaa-8aaa-aaaaaaaaaaaa'], addedAt: '2026-10-15T19:00:00Z', holds: false },
  { title: 'holds a session added after the reading and not seen', ids: [], idle: {}, seen: [], addedAt: '2026-10-15T20:05:00Z', holds: true },
  { title: 'frees a session added after the reading yet seen asleep', ids: [], idle: {}, seen: ['a0000501-aaaa-4aaa-8aaa-aaaaaaaaaaaa'], addedAt: '2026-10-15T20:05:00Z', holds: false },
])('it $title', (row) => {
  const rows = [{ issue: 'GEO-501', session_id: 'a0000501-aaaa-4aaa-8aaa-aaaaaaaaaaaa', added_at: row.addedAt }];
  const reading = { at: '2026-10-15T20:00:00Z', ids: [...row.ids], idle: { ...row.idle }, seen: [...row.seen] };
  const expected = row.holds ? rows : [];

  expect(collectLaneHolders(rows, reading, new Date('2026-10-15T20:10:00Z'))).toStrictEqual(expected);
});

test('it holds a run with one asleep session and one busy session', () => {
  const asleep = { issue: 'GEO-503', session_id: 'a0000503-aaaa-4aaa-8aaa-aaaaaaaaaaaa', added_at: '2026-10-15T19:00:00Z' };
  const busy = { issue: 'GEO-503', session_id: 'a0000501-aaaa-4aaa-8aaa-aaaaaaaaaaaa', added_at: '2026-10-15T19:30:00Z' };
  const reading = { at: '2026-10-15T20:00:00Z', ids: ['a0000501-aaaa-4aaa-8aaa-aaaaaaaaaaaa'], idle: {}, seen: [asleep.session_id, busy.session_id] };

  expect(collectLaneHolders([asleep, busy], reading, new Date('2026-10-15T20:10:00Z'))).toStrictEqual([busy]);
});
