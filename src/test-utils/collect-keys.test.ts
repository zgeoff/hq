import { expect, test } from 'bun:test';
import { collectKeys } from './collect-keys.ts';

test('it collects the own keys of a table in declaration order', () => {
  const table = { kettle: { from: ['cold'] }, teapot: { from: ['warm'] } };

  expect(collectKeys(table)).toStrictEqual(['kettle', 'teapot']);
});

test('it collects nothing from an empty table', () => {
  expect(collectKeys({})).toStrictEqual([]);
});
