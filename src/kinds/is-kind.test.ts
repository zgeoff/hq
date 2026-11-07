import { expect, test } from 'bun:test';
import { isKind } from './is-kind.ts';

test.each([
  { value: 'fix', expected: true },
  { value: 'other', expected: true },
  { value: 'Fix', expected: false },
  { value: 'toString', expected: false },
  { value: '', expected: false },
])('it answers $expected for the kind $value', (testCase) => {
  expect(isKind(testCase.value)).toBe(testCase.expected);
});
