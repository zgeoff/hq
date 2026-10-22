import { expect, test } from 'bun:test';
import { parseGitHubPR } from './parse-github-pr.ts';

test('it reads a merged answer as GitHub\'s merge time, to the second, and its merge commit', () => {
  const stdout = JSON.stringify({ state: 'MERGED', mergedAt: '2026-10-20T03:04:05.678Z', mergeCommit: { oid: '0123456789abcdef0123456789abcdef01234567' } });

  expect(parseGitHubPR('kettle#5', { code: 0, stdout, stderr: '' })).toStrictEqual({ state: 'MERGED', mergedAt: '2026-10-20T03:04:05Z', mergeSha: '0123456789abcdef0123456789abcdef01234567' });
});

test('it keeps a merged answer whose merge commit is not 40 hex characters, with no merge sha', () => {
  const stdout = JSON.stringify({ state: 'MERGED', mergedAt: '2026-10-20T03:04:05Z', mergeCommit: { oid: 'abc' } });

  expect(parseGitHubPR('kettle#5', { code: 0, stdout, stderr: '' })).toStrictEqual({ state: 'MERGED', mergedAt: '2026-10-20T03:04:05Z', mergeSha: null });
});

test('it reads open and closed answers as their state alone', () => {
  expect(parseGitHubPR('kettle#5', { code: 0, stdout: '{"state":"OPEN"}', stderr: '' })).toStrictEqual({ state: 'OPEN' });
  expect(parseGitHubPR('kettle#5', { code: 0, stdout: '{"state":"CLOSED"}', stderr: '' })).toStrictEqual({ state: 'CLOSED' });
});

test('it gives the reason for each answer it cannot read', () => {
  expect(parseGitHubPR('kettle#5', { code: 1, stdout: '', stderr: 'invented: not found\n' })).toStrictEqual({ error: 'kettle#5: can\'t read it (gh exit 1): invented: not found' });
  expect(parseGitHubPR('kettle#5', { code: 0, stdout: 'not json', stderr: '' })).toStrictEqual({ error: 'kettle#5: gh gave no JSON' });
  expect(parseGitHubPR('kettle#5', { code: 0, stdout: '{}', stderr: '' })).toStrictEqual({ error: 'kettle#5: gh gave no state' });
  expect(parseGitHubPR('kettle#5', { code: 0, stdout: '{"state":"MERGED","mergedAt":null}', stderr: '' })).toStrictEqual({ error: 'kettle#5: GitHub says merged but gave no merge time' });
});
