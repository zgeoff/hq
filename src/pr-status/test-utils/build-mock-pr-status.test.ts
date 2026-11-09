import { expect, test } from 'bun:test';
import { buildMockPRStatus } from './build-mock-pr-status.ts';

test('it builds a default record of a PR at a known head', () => {
  expect(buildMockPRStatus()).toStrictEqual({ repo: 'widgets', pr: 7, head: '0123456789abcdef0123456789abcdef01234567' });
});

test('it applies overrides on top of the defaults', () => {
  expect(buildMockPRStatus({ pr: 8, gate: 'none', head: null })).toStrictEqual({ repo: 'widgets', pr: 8, head: null, gate: 'none' });
});
