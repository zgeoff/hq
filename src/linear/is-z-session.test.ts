import { expect, test } from 'bun:test';
import { isZSession } from './is-z-session.ts';

test.each([
  ['a listed session', 'z-kettle', true],
  ['an unlisted name', 'z-teapot', false],
  ['an old source', 'owner', false],
] as const)('it answers whether %s is a fleet session', (_name, name, expected) => {
  expect(isZSession(name, ['z-kettle'])).toBe(expected);
});
