import { expect, test } from 'bun:test';
import { collectWrappedPartSessions } from './collect-wrapped-part-sessions.ts';

test.each([
  { title: 'a finished wrap-up', events: [['part-wrap-up', '2026-11-07T01:00:00Z'], ['part-wrap-up-done', '2026-11-07T01:01:00Z']], wrapped: true },
  { title: 'a claim still in its window', events: [['part-wrap-up', '2026-11-07T02:45:00Z']], wrapped: true },
  { title: 'a claim exactly at the bound', events: [['part-wrap-up', '2026-11-07T02:30:00Z']], wrapped: false },
  { title: 'an abandoned claim', events: [['part-wrap-up', '2026-11-07T01:00:00Z']], wrapped: false },
  { title: 'an abandoned claim and a fresh retry', events: [['part-wrap-up', '2026-11-07T01:00:00Z'], ['part-wrap-up', '2026-11-07T02:58:00Z']], wrapped: true },
  { title: 'no event', events: [], wrapped: false },
])('it counts the session as wrapped for $title: $wrapped', (row) => {
  const events = row.events.map(([action, at]) => ({ action: action ?? '', atMs: Date.parse(at ?? ''), session: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }));

  const wrapped = collectWrappedPartSessions(events, Date.parse('2026-11-07T03:00:00Z'), 30 * 60_000);

  expect(wrapped).toStrictEqual(new Set(row.wrapped ? ['0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa'] : []));
});
