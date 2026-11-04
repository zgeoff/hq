import { expect, test } from 'bun:test';
import { buildAreaLabels } from './build-area-labels.ts';

test('it keeps the repo checks of the labels still in the list', () => {
  const stored = { at: '2026-10-15T19:00:00Z', names: ['kettle', 'teapot'], repoExists: { kettle: true, teapot: false } };

  expect(buildAreaLabels(stored, ['kettle', 'mug'], '2026-10-16T08:00:00Z')).toStrictEqual({ at: '2026-10-16T08:00:00Z', names: ['kettle', 'mug'], repoExists: { kettle: true } });
});

test('it starts with no repo checks when nothing is stored', () => {
  expect(buildAreaLabels({ at: null, names: ['hq'], repoExists: {} }, ['mug'], '2026-10-16T08:00:00Z')).toStrictEqual({ at: '2026-10-16T08:00:00Z', names: ['mug'], repoExists: {} });
});
