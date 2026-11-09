import { expect, test } from 'bun:test';
import { buildMockLinearIssue } from './build-mock-linear-issue.ts';

test('it builds a default completed feature issue', () => {
  expect(buildMockLinearIssue()).toStrictEqual({ issue: 'GEO-1', type: 'Feature', title: 'Descale the kettle', state: 'completed', closed_at: null });
});

test('it applies overrides on top of the defaults', () => {
  expect(buildMockLinearIssue({ issue: 'GEO-9', type: 'Bug', state: 'open' })).toStrictEqual({ issue: 'GEO-9', type: 'Bug', title: 'Descale the kettle', state: 'open', closed_at: null });
});
