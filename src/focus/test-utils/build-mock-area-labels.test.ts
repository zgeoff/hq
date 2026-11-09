import { expect, test } from 'bun:test';
import { buildMockAreaLabels } from './build-mock-area-labels.ts';

test('it builds default area labels with no names', () => {
  expect(buildMockAreaLabels()).toStrictEqual({ at: '2026-10-15T19:00:00Z', names: [], repoExists: {} });
});

test('it applies overrides on top of the defaults', () => {
  expect(buildMockAreaLabels({ names: ['teapot'], repoExists: { teapot: true } })).toStrictEqual({ at: '2026-10-15T19:00:00Z', names: ['teapot'], repoExists: { teapot: true } });
});
