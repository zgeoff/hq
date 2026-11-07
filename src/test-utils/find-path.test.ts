import { expect, test } from 'bun:test';
import { findPath } from './find-path.ts';

test('it finds a value through object keys and array indexes', () => {
  const value: unknown = JSON.parse('{"items":[{"id":"kettle"},{"id":"teapot"}]}');

  expect(findPath(value, 'items', 1, 'id')).toBe('teapot');
});

test('it returns the value itself for an empty path', () => {
  const value: unknown = JSON.parse('{"value":1}');

  expect(findPath(value)).toStrictEqual({ value: 1 });
});

test.each([
  ['a missing key', ['nope']],
  ['a key under a primitive', ['name', 'length']],
  ['an index under an object', [0]],
  ['a key under an array', ['items', 'id']],
  ['an index past the end', ['items', 5]],
])('it returns undefined for %s', (_title, path) => {
  const value: unknown = JSON.parse('{"name":"kettle","items":[1]}');

  expect(findPath(value, ...path)).toBeUndefined();
});
