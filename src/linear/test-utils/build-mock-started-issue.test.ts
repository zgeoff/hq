import { expect, test } from 'bun:test';
import { buildMockStartedIssue } from './build-mock-started-issue.ts';

test('it builds a default started issue', () => {
  expect(buildMockStartedIssue()).toStrictEqual({ issue: 'GEO-1', started_at: '2026-10-10T01:00:00Z', fetched_at: '2026-10-16T01:00:00Z' });
});

test('it applies overrides on top of the defaults', () => {
  expect(buildMockStartedIssue({ issue: 'GEO-2' })).toStrictEqual({ issue: 'GEO-2', started_at: '2026-10-10T01:00:00Z', fetched_at: '2026-10-16T01:00:00Z' });
});
