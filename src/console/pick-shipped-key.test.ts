import { expect, test } from 'bun:test';
import { pickShippedKey } from './pick-shipped-key.ts';

test('t, y and w pick today, yesterday and the week; ? opens the key list and Esc closes it', () => {
  expect(['t', 'y', 'w', '?', 'Escape', 'j'].map((key) => pickShippedKey({ key, inText: false, modified: false }))).toStrictEqual([
    { kind: 'period', period: 'today' },
    { kind: 'period', period: 'yesterday' },
    { kind: 'period', period: 'week' },
    { kind: 'help' },
    { kind: 'close' },
    null,
  ]);
});

test('a modifier or a text box picks none', () => {
  expect([pickShippedKey({ key: 'w', inText: true, modified: false }), pickShippedKey({ key: 't', inText: false, modified: true })]).toStrictEqual([null, null]);
});
