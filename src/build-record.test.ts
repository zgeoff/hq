import { expect, test } from 'bun:test';
import { buildRecord } from './build-record.ts';

test('buildRecord maps each key to the value the callback returns', () => {
  expect(buildRecord(['a', 'bb'], (key) => key.length)).toStrictEqual({ a: 1, bb: 2 });
});

test('buildRecord returns an empty record for no keys', () => {
  expect(buildRecord([], () => 0)).toStrictEqual({});
});
