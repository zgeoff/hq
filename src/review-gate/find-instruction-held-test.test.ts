import { expect, test } from 'bun:test';
import { findInstructionHeldTest } from './find-instruction-held-test.ts';

test('it holds the instruction files of a zgeoff repo', () => {
  expect(findInstructionHeldTest({ owner: 'zgeoff', repo: 'widgets' })?.('skills/kettle/SKILL.md')).toBe(true);
});

test.each([
  ['zgeoff', 'hq'],
  ['zgeoff', 'hq-private'],
  ['zgeoff', 'nixie-definitions'],
  ['teapot', 'widgets'],
])('it holds no instruction file of %s/%s', (owner, repo) => {
  expect(findInstructionHeldTest({ owner, repo })).toBeNull();
});
