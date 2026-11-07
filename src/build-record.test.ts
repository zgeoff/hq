import { expect, test } from 'bun:test';
import { buildRecord } from './build-record.ts';

test('#buildRecord maps each key to the value the callback returns', () => {
  expect(buildRecord(['aa', 'bbb'], (name) => name.length)).toStrictEqual({ aa: 2, bbb: 3 });
});

test('#buildRecord returns an empty record for no keys', () => {
  expect(buildRecord([], () => 0)).toStrictEqual({});
});
