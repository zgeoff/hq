import { expect, test } from 'bun:test';
import { buildReadyIssue } from '../../test/build-ready-issue.ts';
import { parseFocusTerms } from './parse-focus-terms.ts';
import { sortByFocus } from './sort-by-focus.ts';

test('it puts a lower-priority Design issue that matches a term before a higher-priority one that matches none', () => {
  const issues = [buildReadyIssue('GEO-9851', { type: 'Design', priority: 1 }), buildReadyIssue('GEO-9852', { type: 'Design', priority: 4, projectLabels: ['maintenance'] })];

  const sorted = sortByFocus(issues, parseFocusTerms('maintenance'));

  expect(sorted.map((entry) => [entry.issue.identifier, entry.term])).toStrictEqual([
    ['GEO-9852', 0],
    ['GEO-9851', null],
  ]);
});
