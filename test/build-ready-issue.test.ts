import { expect, test } from 'bun:test';
import { buildReadyIssue } from './build-ready-issue.ts';

test('it defaults to no project, labels or parent, and takes overrides', () => {
  expect([buildReadyIssue('GEO-1'), buildReadyIssue('GEO-2', { project: 'invented project' })]).toStrictEqual([
    { identifier: 'GEO-1', project: null, projectLabels: [], labels: [], type: 'none', priority: 0, createdAt: '2026-10-01T00:00:00.000Z', parent: null },
    { identifier: 'GEO-2', project: 'invented project', projectLabels: [], labels: [], type: 'none', priority: 0, createdAt: '2026-10-01T00:00:00.000Z', parent: null },
  ]);
});
