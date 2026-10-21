import { expect, test } from 'bun:test';
import { parsePRCondition } from './parse-pr-condition.ts';

test('it reads owner/repo#n as that PR', () => {
  expect(parsePRCondition('kettle-co/kettle.app#42')).toStrictEqual({ owner: 'kettle-co', repo: 'kettle.app', number: 42 });
});

test.each(['kettle#4', 'kettle-co/kettle#x', 'kettle-co/kettle', ''])('it reads %p as no PR', (ref) => {
  expect(parsePRCondition(ref)).toBeNull();
});
