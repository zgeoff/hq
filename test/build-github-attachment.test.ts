import { expect, test } from 'bun:test';
import { buildGithubAttachment } from './build-github-attachment.ts';

test('it builds the attachment of a kettle PR with its status and merge time', () => {
  expect(buildGithubAttachment(41, 'merged', '2026-10-14T01:00:00Z')).toStrictEqual({
    url: 'https://github.com/zgeoff/kettle/pull/41',
    sourceType: 'github',
    metadata: { status: 'merged', mergedAt: '2026-10-14T01:00:00Z', number: 41, repoName: 'kettle', repoLogin: 'zgeoff' },
  });
});

test('it leaves the merge time null by default', () => {
  expect(buildGithubAttachment(42, 'open').metadata.mergedAt).toBeNull();
});
