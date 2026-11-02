import { expect, test } from 'bun:test';
import { pickOwnerWaitClear } from './pick-owner-wait-clear.ts';

test.each([
  ['the wait names the merged PR, with another still open', { waitsOnGeoff: true, waitsOn: 'owner to merge kettle#41' }, 'kettle#41', 1, 'named'],
  ['the wait names another PR and the merged one was the last open', { waitsOnGeoff: true, waitsOn: 'owner to merge kettle#42' }, 'kettle#41', 0, 'last-open'],
  ['the wait names no PR and none is left open', { waitsOnGeoff: true, waitsOn: null }, 'kettle#41', 0, 'last-open'],
  ['the wait names another PR and one is still open', { waitsOnGeoff: true, waitsOn: 'owner to merge kettle#42' }, 'kettle#41', 1, null],
  ['the wait names a longer number that starts with the merged one', { waitsOnGeoff: true, waitsOn: 'owner to merge kettle#412' }, 'kettle#41', 1, null],
  ['the wait names the PR of a longer repo name', { waitsOnGeoff: true, waitsOn: 'owner to merge mykettle#41' }, 'kettle#41', 1, null],
  ['the wait is not the owner\'s', { waitsOnGeoff: false, waitsOn: 'CI on kettle#41' }, 'kettle#41', 0, null],
] as const)('it picks the rule when %s', (_case, run, ref, openLeft, expected) => {
  expect(pickOwnerWaitClear(run, ref, openLeft)).toBe(expected);
});
