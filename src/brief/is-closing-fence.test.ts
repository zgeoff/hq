import { expect, test } from 'bun:test';
import { isClosingFence } from './is-closing-fence.ts';

test.each([
  ['the same run', '````', true],
  ['a longer run', '`````', true],
  ['a shorter run', '```', false],
  ['the other marker', '~~~~', false],
  ['a run with an info string', '```` md', false],
])('it decides whether a line with %s closes a four-backtick fence', (_, line, expected) => {
  expect(isClosingFence({ marker: '`', length: 4, info: 'md' }, line)).toBe(expected);
});
