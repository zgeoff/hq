import { expect, test } from 'bun:test';
import { pickIssueRepo } from './pick-issue-repo.ts';

test('it picks the repo of the one area label', () => {
  expect(pickIssueRepo({ identifier: 'GEO-9001', description: '', labels: [{ name: 'Bug', parent: { name: 'Type' } }, { name: 'cloud' }] })).toBe('cloud');
});

test('it refuses an issue with no area label, and one with two', () => {
  expect(() => pickIssueRepo({ identifier: 'GEO-9001', description: '', labels: [] })).toThrow('GEO-9001 needs exactly one area label to name its repo; it has none');
  expect(() => pickIssueRepo({ identifier: 'GEO-9001', description: '', labels: [{ name: 'cloud' }, { name: 'imp' }] })).toThrow('GEO-9001 needs exactly one area label to name its repo; it has cloud, imp');
});
