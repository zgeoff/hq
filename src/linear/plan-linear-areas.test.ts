import { expect, test } from 'bun:test';
import { planLinearAreas } from './plan-linear-areas.ts';

test('it stores the list for the team lanes reads and names each missing repo', () => {
  expect(planLinearAreas({ team: 'GEO', lanesTeam: 'GEO', names: ['kettle', 'teapot'], repoExists: { kettle: true, teapot: false }, at: '2026-10-16T08:00:00Z' })).toStrictEqual({
    store: { at: '2026-10-16T08:00:00Z', names: ['kettle', 'teapot'], repoExists: { kettle: true, teapot: false } },
    missing: ['teapot'],
  });
});

test('it stores nothing for another team', () => {
  expect(planLinearAreas({ team: 'KET', lanesTeam: 'GEO', names: ['kettle'], repoExists: { kettle: true }, at: '2026-10-16T08:00:00Z' })).toStrictEqual({ store: null, missing: [] });
});
