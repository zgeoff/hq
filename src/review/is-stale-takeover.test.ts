import { expect, test } from 'bun:test';
import { isStaleTakeover } from './is-stale-takeover.ts';

test.each([
  ['a takeover that vanished before its start time was read', null, false],
  ['a takeover that started a second ago', 1_699_999_999_000, false],
  ['a takeover that started a minute ago', 1_699_999_940_000, false],
  ['a takeover that started two minutes ago', 1_699_999_880_000, true],
])('it reads %s as stale: %p', (_case, startedMs, stale) => {
  expect(isStaleTakeover(startedMs, 1_700_000_000_000)).toBe(stale);
});
