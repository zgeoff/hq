import { expect, test } from 'bun:test';
import { pickIssueRepo } from './pick-issue-repo.ts';

test('it picks the area of the one area label, with its repo', () => {
  expect(pickIssueRepo({ identifier: 'GEO-9001', description: '', labels: [{ name: 'Bug', parent: { name: 'Type' } }, { name: 'cloud' }] })).toStrictEqual({ kind: 'picked', area: { label: 'cloud', repo: 'cloud' }, others: [] });
});

test('it refuses an issue with no area label', () => {
  expect(pickIssueRepo({ identifier: 'GEO-9001', description: '', labels: [] })).toStrictEqual({ kind: 'refused', code: 'bad_state', message: 'GEO-9001 needs an area label to name its repo; it has none' });
});

test('it refuses an issue with two areas and names --repo', () => {
  expect(pickIssueRepo({ identifier: 'GEO-9001', description: '', labels: [{ name: 'cloud' }, { name: 'imp' }] })).toStrictEqual({ kind: 'refused', code: 'bad_state', message: 'GEO-9001 has several areas (cloud, imp): brief one at a time with --repo <area>' });
});

test('it picks the area --repo names by its label', () => {
  expect(pickIssueRepo({ identifier: 'GEO-9001', description: '', labels: [{ name: 'cloud' }, { name: 'imp' }] }, 'imp')).toStrictEqual({ kind: 'picked', area: { label: 'imp', repo: 'impz' }, others: [{ label: 'cloud', repo: 'cloud' }] });
});

test('it picks the area --repo names by its repo', () => {
  expect(pickIssueRepo({ identifier: 'GEO-9001', description: '', labels: [{ name: 'cloud' }, { name: 'imp' }] }, 'impz')).toStrictEqual({ kind: 'picked', area: { label: 'imp', repo: 'impz' }, others: [{ label: 'cloud', repo: 'cloud' }] });
});

test('it refuses a --repo that is not one of the issue areas', () => {
  expect(pickIssueRepo({ identifier: 'GEO-9001', description: '', labels: [{ name: 'cloud' }, { name: 'imp' }] }, 'tools')).toStrictEqual({ kind: 'refused', code: 'bad_args', message: "--repo tools is not one of GEO-9001's areas; it has cloud, imp" });
});

test('it refuses a label that names no repo hq knows, by name', () => {
  expect(pickIssueRepo({ identifier: 'GEO-9001', description: '', labels: [{ name: 'cloud' }, { name: 'teapot' }] })).toStrictEqual({ kind: 'refused', code: 'bad_state', message: 'GEO-9001 has the label teapot, which names no repo hq knows: add it to AREA_REPOS in src/brief/area-repos.ts, or take it off the issue' });
});
