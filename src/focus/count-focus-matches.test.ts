import { expect, test } from 'bun:test';
import { buildReadyIssue } from '../../test/build-ready-issue.ts';
import { countFocusMatches } from './count-focus-matches.ts';


test('it counts every issue while no focus is set', () => {
  const issues = [buildReadyIssue('GEO-9901', { type: 'Feature' }), buildReadyIssue('GEO-9902', { type: 'Bug' })];

  expect(countFocusMatches(issues, null)).toBe(2);
});

test('it counts the issues that match a term', () => {
  const focus = { terms: [{ text: 'bug', filters: [{ kind: 'type' as const, value: 'bug' as const }] }], reserves: [], setAt: '2026-10-14T01:00:00Z', setBy: 'kettle-owner' };
  const issues = [buildReadyIssue('GEO-9901', { type: 'Feature' }), buildReadyIssue('GEO-9902', { type: 'Bug' })];

  expect(countFocusMatches(issues, focus)).toBe(1);
});
