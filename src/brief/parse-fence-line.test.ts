import { expect, test } from 'bun:test';
import { parseFenceLine } from './parse-fence-line.ts';

test.each([
  ['```', { marker: '`' as const, length: 3, info: '' }],
  ['```text', { marker: '`' as const, length: 3, info: 'text' }],
  ['````md', { marker: '`' as const, length: 4, info: 'md' }],
  ['~~~ kettle ', { marker: '~' as const, length: 3, info: 'kettle' }],
  ['   ```', { marker: '`' as const, length: 3, info: '' }],
])('it reads %j as a fence line', (line, expected) => {
  expect(parseFenceLine(line)).toStrictEqual(expected);
});

test.each([
  ['two backticks', '``'],
  ['four spaces of indent', '    ```'],
  ['a backtick in the info string', '``` kettle`lid'],
  ['prose', 'The kettle boils.'],
])('it reads %s as no fence line', (_, line) => {
  expect(parseFenceLine(line)).toBeNull();
});
