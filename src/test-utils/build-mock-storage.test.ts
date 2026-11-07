import { expect, test } from 'bun:test';
import { buildMockStorage } from './build-mock-storage.ts';

test('it returns a kept value, and null for a key never set', () => {
  const storage = buildMockStorage();
  storage.setItem('colour', 'teal');

  expect([storage.getItem('colour'), storage.getItem('shape')]).toStrictEqual(['teal', null]);
});

test('it overwrites a key that is set again', () => {
  const storage = buildMockStorage();
  storage.setItem('colour', 'teal');
  storage.setItem('colour', 'plum');

  expect([storage.getItem('colour'), storage.length]).toStrictEqual(['plum', 1]);
});

test('it forgets a removed key, and every key once cleared', () => {
  const storage = buildMockStorage();
  storage.setItem('colour', 'teal');
  storage.setItem('shape', 'oval');
  storage.removeItem('colour');

  expect([storage.getItem('colour'), storage.length]).toStrictEqual([null, 1]);

  storage.clear();

  expect([storage.getItem('shape'), storage.length]).toStrictEqual([null, 0]);
});

test('it names a key by its position, or null past the end', () => {
  const storage = buildMockStorage();
  storage.setItem('colour', 'teal');

  expect([storage.key(0), storage.key(1)]).toStrictEqual(['colour', null]);
});
