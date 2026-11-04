import { expect, test } from 'bun:test';
import { planLinearAreas } from './plan-linear-areas.ts';

test('it stores the list for the team lanes reads and names each missing repo', () => {
  expect(planLinearAreas('GEO', 'GEO', ['kettle', 'teapot'], { kettle: true, teapot: false }, '2026-10-16T08:00:00Z')).toStrictEqual({
    store: { at: '2026-10-16T08:00:00Z', names: ['kettle', 'teapot'], repoExists: { kettle: true, teapot: false } },
    missing: ['teapot'],
  });
});

test('it stores nothing for another team', () => {
  expect(planLinearAreas('KET', 'GEO', ['kettle'], { kettle: true }, '2026-10-16T08:00:00Z')).toStrictEqual({ store: null, missing: [] });
});
