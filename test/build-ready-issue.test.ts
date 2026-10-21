import { expect, test } from 'bun:test';
import { buildReadyIssue } from './build-ready-issue.ts';

test('it defaults to no project, labels or parent, and takes overrides', () => {
  expect([buildReadyIssue('GEO-1'), buildReadyIssue('GEO-2', { project: 'invented project' })]).toStrictEqual([
    { identifier: 'GEO-1', project: null, labels: [], parent: null },
    { identifier: 'GEO-2', project: 'invented project', labels: [], parent: null },
  ]);
});
