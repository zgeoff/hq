import { expect, test } from 'bun:test';
import { pickOwnerWaitClear } from './pick-owner-wait-clear.ts';

test.each([
  { name: 'the wait names the merged PR, with another still open', waitsOn: 'owner to merge kettle#41', openLeft: 1, expected: 'named' },
  { name: 'the wait names another PR and the merged one was the last open', waitsOn: 'owner to merge kettle#42', openLeft: 0, expected: 'last-open' },
  { name: 'the wait names no PR and none is left open', waitsOn: null, openLeft: 0, expected: 'last-open' },
  { name: 'the wait names another PR and one is still open', waitsOn: 'owner to merge kettle#42', openLeft: 1, expected: null },
  { name: 'the wait names a longer number that starts with the merged one', waitsOn: 'owner to merge kettle#412', openLeft: 1, expected: null },
  { name: 'the wait names the PR of a longer repo name', waitsOn: 'owner to merge mykettle#41', openLeft: 1, expected: null },
])('it picks the rule when $name', (row) => {
  expect(pickOwnerWaitClear({ waitsOnGeoff: true, waitsOn: row.waitsOn }, 'kettle#41', row.openLeft)).toBe(row.expected);
});

test('it keeps a wait that is not the owner\'s', () => {
  expect(pickOwnerWaitClear({ waitsOnGeoff: false, waitsOn: 'CI on kettle#41' }, 'kettle#41', 0)).toBeNull();
});
