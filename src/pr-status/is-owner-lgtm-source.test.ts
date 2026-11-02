import { expect, test } from 'bun:test';
import { isOwnerLgtmSource } from './is-owner-lgtm-source.ts';

test.each([
  ['chat:kettle-1'],
  ['chat:kettle-1@ward'],
  ['console:kettle-2'],
  ['call:kettle-3'],
  [`rebased:${'ab12'.repeat(10)}`],
])('it takes %p as the owner word', (source) => {
  expect(isOwnerLgtmSource(source)).toBe(true);
});

test.each([
  ['an empty string', ''],
  ['rebased: with no sha', 'rebased:'],
  ['rebased: with a space before the sha', 'rebased: abc'],
  ['rebased: with a short sha', 'rebased:abc1234'],
  ['rebased: with a word that is not hex', 'rebased:xyz'],
  ['rebased: with text after the sha', `rebased:${'ab12'.repeat(10)}extra`],
  ['rebased: with an uppercase sha', `rebased:${'AB12'.repeat(10)}`],
  ['REBASED: in capitals', `REBASED:${'ab12'.repeat(10)}`],
  ['a longer prefix', `rebasedx:${'ab12'.repeat(10)}`],
  ['a leading space', ` rebased:${'ab12'.repeat(10)}`],
  ['a trailing space', `rebased:${'ab12'.repeat(10)} `],
  ['a trailing newline', `rebased:${'ab12'.repeat(10)}\n`],
  ['a newline inside the sha', `rebased:${'ab12'.repeat(5)}\n${'ab12'.repeat(5)}`],
  ['a newline inside a chat id', 'chat:kettle\n1'],
  ['chat: with no id', 'chat:'],
  ['console: with no id', 'console:'],
  ['a source kind hq does not take', 'mail:kettle-1'],
  ['the owner name alone', 'geoff'],
])('it refuses %s', (_label, source) => {
  expect(isOwnerLgtmSource(source)).toBe(false);
});
