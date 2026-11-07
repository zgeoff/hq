import { expect, test } from 'bun:test';
import { isIssueType } from './is-issue-type.ts';

test.each([
  { value: 'Bug', expected: true },
  { value: 'none', expected: true },
  { value: 'bug', expected: false },
  { value: 'toString', expected: false },
  { value: '', expected: false },
])('it answers $expected for the issue type $value', (testCase) => {
  expect(isIssueType(testCase.value)).toBe(testCase.expected);
});
