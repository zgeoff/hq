import { expect, test } from 'bun:test';
import { parseOneFlag } from './parse-one-flag.ts';

test('it reads an absent flag as undefined', () => {
  expect(parseOneFlag(undefined, 'check')).toBeUndefined();
});

test('it reads a flag given once as its value', () => {
  expect(parseOneFlag(['kettle'], 'check')).toBe('kettle');
});

test('it refuses a flag given twice', () => {
  expect(() => parseOneFlag(['kettle', 'teapot'], 'check')).toThrow(expect.objectContaining({ code: 'bad_args', message: 'give --check once, not 2 times' }));
});
