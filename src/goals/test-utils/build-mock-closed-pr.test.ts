import { expect, test } from 'bun:test';
import { buildMockClosedPR } from './build-mock-closed-pr.ts';

test('it builds a default closed, unmerged PR', () => {
  expect(buildMockClosedPR()).toStrictEqual({ repo: 'atc', number: 1, closed_at: '2026-10-15T03:00:00Z' });
});

test('it applies overrides on top of the defaults', () => {
  expect(buildMockClosedPR({ repo: 'cloud', number: 4 })).toStrictEqual({ repo: 'cloud', number: 4, closed_at: '2026-10-15T03:00:00Z' });
});
