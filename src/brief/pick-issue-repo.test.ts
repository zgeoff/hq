import { expect, test } from 'bun:test';
import { pickIssueRepo } from './pick-issue-repo.ts';

test('it picks the area of the one area label, with its repo', () => {
  expect(pickIssueRepo({ identifier: 'GEO-9001', description: '', labels: [{ name: 'Bug', parent: { name: 'Type' } }, { name: 'cloud' }] })).toStrictEqual({ label: 'cloud', repo: 'cloud' });
});

test('it refuses an issue with no area label', () => {
  expect(() => pickIssueRepo({ identifier: 'GEO-9001', description: '', labels: [] })).toThrow('GEO-9001 needs an area label to name its repo; it has none');
});

test('it refuses an issue with two areas and names --repo', () => {
  expect(() => pickIssueRepo({ identifier: 'GEO-9001', description: '', labels: [{ name: 'cloud' }, { name: 'imp' }] })).toThrow('GEO-9001 has several areas (cloud, imp): brief one at a time with --repo <area>');
});

test('it picks the area --repo names by its label', () => {
  expect(pickIssueRepo({ identifier: 'GEO-9001', description: '', labels: [{ name: 'cloud' }, { name: 'imp' }] }, 'imp')).toStrictEqual({ label: 'imp', repo: 'impz' });
});

test('it picks the area --repo names by its repo', () => {
  expect(pickIssueRepo({ identifier: 'GEO-9001', description: '', labels: [{ name: 'cloud' }, { name: 'imp' }] }, 'impz')).toStrictEqual({ label: 'imp', repo: 'impz' });
});

test('it refuses a --repo that is not one of the issue areas', () => {
  expect(() => pickIssueRepo({ identifier: 'GEO-9001', description: '', labels: [{ name: 'cloud' }, { name: 'imp' }] }, 'tools')).toThrow("--repo tools is not one of GEO-9001's areas; it has cloud, imp");
});
