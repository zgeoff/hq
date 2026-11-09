import { expect, test } from 'bun:test';
import { buildMockNewRunPR } from './build-mock-new-run-pr.ts';

test('it builds a default new run PR', () => {
  expect(buildMockNewRunPR()).toStrictEqual({ issue: 'GEO-9001', ref: 'kettle#1' });
});

test('it applies overrides on top of the defaults', () => {
  expect(buildMockNewRunPR({ ref: 'kettle#7' })).toStrictEqual({ issue: 'GEO-9001', ref: 'kettle#7' });
});
