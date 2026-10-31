import { expect, test } from 'bun:test';
import { pickIssueRepo } from './pick-issue-repo.ts';

test('it picks the repo of the one area label', () => {
  expect(pickIssueRepo({ identifier: 'GEO-9001', description: '', labels: [{ name: 'Bug', parent: { name: 'Type' } }, { name: 'cloud' }] })).toBe('cloud');
});

test('it refuses an issue with no area label, and one with two', () => {
  expect(() => pickIssueRepo({ identifier: 'GEO-9001', description: '', labels: [] })).toThrow('GEO-9001 needs an area label to name its repo; it has none');
  expect(() => pickIssueRepo({ identifier: 'GEO-9001', description: '', labels: [{ name: 'cloud' }, { name: 'imp' }] })).toThrow('GEO-9001 has several areas (cloud, imp): brief one at a time with --repo <area>');
});

test('it picks the area --repo names when it is one of the issue areas, and refuses one that is not', () => {
  const issue = { identifier: 'GEO-9001', description: '', labels: [{ name: 'cloud' }, { name: 'imp' }] };

  expect(pickIssueRepo(issue, 'imp')).toBe('imp');
  expect(() => pickIssueRepo(issue, 'tools')).toThrow("--repo tools is not one of GEO-9001's areas; it has cloud, imp");
});
