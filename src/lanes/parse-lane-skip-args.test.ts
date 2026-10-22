import { expect, test } from 'bun:test';
import { parseLaneSkipArgs } from './parse-lane-skip-args.ts';

test('it parses a set with its until and reason', () => {
  expect(parseLaneSkipArgs(['GEO-9861'], 'GEO-9869', 'waits on the descaler PR')).toStrictEqual({ kind: 'set', issue: 'GEO-9861', until: 'GEO-9869', reason: 'waits on the descaler PR' });
});

test('it parses list', () => {
  expect(parseLaneSkipArgs(['list'], undefined, undefined)).toStrictEqual({ kind: 'list' });
});

test('it parses drop with its issue', () => {
  expect(parseLaneSkipArgs(['drop', 'GEO-9861'], undefined, undefined)).toStrictEqual({ kind: 'drop', issue: 'GEO-9861' });
});

test.each([
  { label: 'a bad issue id', rest: ['geo-9861'], until: '2026-10-16T09:00:00Z', reason: 'held', message: 'hq lanes skip takes an issue like GEO-123, list or drop, not "geo-9861"' },
  { label: 'a missing until', rest: ['GEO-9861'], until: undefined, reason: 'held', message: '--until is required' },
  { label: 'a missing reason', rest: ['GEO-9861'], until: 'GEO-9869', reason: undefined, message: '--reason is required' },
  { label: 'an unknown subcommand', rest: ['clear', 'GEO-9861'], until: undefined, reason: undefined, message: 'unknown command: hq lanes skip clear GEO-9861' },
  { label: 'no arguments', rest: [], until: undefined, reason: undefined, message: 'usage: hq lanes skip <issue>' },
])('it refuses $label with bad_args', (row) => {
  expect(() => parseLaneSkipArgs(row.rest, row.until, row.reason)).toThrow(expect.objectContaining({ code: 'bad_args', message: expect.stringContaining(row.message) }));
});
