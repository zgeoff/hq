import { expect, test } from 'bun:test';
import { buildGithubAttachment } from '../../test/build-github-attachment.ts';
import { parseStartedPRs } from './parse-started-prs.ts';

test('it reads the ref, status and merge time of GitHub attachments', () => {
  const prs = parseStartedPRs([buildGithubAttachment(41, 'merged', '2026-10-14T01:00:00Z'), buildGithubAttachment(42, 'open'), { ...buildGithubAttachment(43, 'draft'), metadata: { status: 'draft', number: 43, repoName: 'teapot' } }]);

  expect(prs).toStrictEqual([
    { ref: 'kettle#41', status: 'merged', mergedAt: '2026-10-14T01:00:00Z' },
    { ref: 'kettle#42', status: 'open', mergedAt: null },
    { ref: 'teapot#43', status: 'draft', mergedAt: null },
  ]);
});

test('it leaves out attachments that are not GitHub, have no usable status, or name no PR', () => {
  const github = buildGithubAttachment(44, 'merged');
  const prs = parseStartedPRs([
    { url: 'https://example.com/x', sourceType: 'slack', metadata: { status: 'merged' } },
    { ...github, metadata: { number: 44, repoName: 'kettle' } },
    { ...github, metadata: { status: 'weird', number: 45, repoName: 'kettle' } },
    { ...github, metadata: null },
    { url: 'https://example.com/none', sourceType: 'github', metadata: { status: 'closed' } },
    'not an attachment',
  ]);

  expect(prs).toStrictEqual([]);
});

test('it takes the ref from the URL when the metadata lacks the repo or number', () => {
  const attachment = { ...buildGithubAttachment(41, 'closed'), metadata: { status: 'closed' } };

  expect(parseStartedPRs([attachment])).toStrictEqual([{ ref: 'kettle#41', status: 'closed', mergedAt: null }]);
});
