import { expect, test } from 'bun:test';
import { isOverFailedChild } from './is-over-failed-child.ts';

test.each([
  ['a failed child', new Set(['0000f004-aaaa-4aaa-8aaa-aaaaaaaaaaaa']), true],
  ['no failed child', new Set<string>(), false],
  ['a failed session that is not its child', new Set(['0000f009-aaaa-4aaa-8aaa-aaaaaaaaaaaa']), false],
])('it says whether a parent sits over %s', (_case, failedIDs, expected) => {
  const parent = { session: { id: '0000f001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: false, state: 'exited' }, issue: 'GEO-601', place: 'local' } as const;
  const child = { session: { id: '0000f004-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-helper', alive: false, state: 'exited', parent: '0000f001-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }, issue: null, place: 'local' } as const;

  expect(isOverFailedChild(parent, [child, parent], failedIDs)).toBe(expected);
});
