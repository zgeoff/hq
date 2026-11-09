import { expect, test } from 'bun:test';
import { buildMockNewRunPr } from './build-mock-new-run-pr.ts';

test('it builds a default new run PR', () => {
  expect(buildMockNewRunPr()).toStrictEqual({ issue: 'GEO-9001', ref: 'kettle#1' });
});

test('it applies overrides on top of the defaults', () => {
  expect(buildMockNewRunPr({ ref: 'kettle#7' })).toStrictEqual({ issue: 'GEO-9001', ref: 'kettle#7' });
});
