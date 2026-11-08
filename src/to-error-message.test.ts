import { expect, test } from 'bun:test';
import { HqError } from './errors.ts';
import { toErrorMessage } from './to-error-message.ts';

test('#toErrorMessage returns the message of an Error', () => {
  expect(toErrorMessage(new Error('disk full'))).toBe('disk full');
});

test('#toErrorMessage returns the message of an HqError', () => {
  expect(toErrorMessage(new HqError('bad_args', 'bad flag'))).toBe('bad flag');
});

test.each([
  ['a thrown string', 'nope', 'nope'],
  ['a thrown number', 42, '42'],
  ['a thrown null', null, 'null'],
  ['a thrown undefined', undefined, 'undefined'],
])('#toErrorMessage shows the text of %s', (_name, thrown, expected) => {
  expect(toErrorMessage(thrown)).toBe(expected);
});
