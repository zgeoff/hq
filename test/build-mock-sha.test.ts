import { expect, test } from 'bun:test';
import { buildMockSha } from './build-mock-sha.ts';

test('it pads a commit number to 40 hex characters', () => {
  expect(buildMockSha(255)).toBe('00000000000000000000000000000000000000ff');
});

test('it gives different commits for different numbers', () => {
  expect(buildMockSha(1)).not.toBe(buildMockSha(2));
});
