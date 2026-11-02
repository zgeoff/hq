import { expect, test } from 'bun:test';
import { parseStartedPrs } from './parse-started-prs.ts';

const github = (metadata: unknown, url = 'https://github.com/zgeoff/kettle/pull/41') => ({ url, sourceType: 'github', metadata });

test('it reads the ref, status and merge time of GitHub attachments', () => {
  const prs = parseStartedPrs([
    github({ status: 'merged', mergedAt: '2026-10-14T01:00:00Z', number: 41, repoName: 'kettle', repoLogin: 'zgeoff' }),
    github({ status: 'open', mergedAt: null, number: 42, repoName: 'kettle' }),
    github({ status: 'draft', number: 43, repoName: 'teapot' }),
  ]);

  expect(prs).toStrictEqual([
    { ref: 'kettle#41', status: 'merged', mergedAt: '2026-10-14T01:00:00Z' },
    { ref: 'kettle#42', status: 'open', mergedAt: null },
    { ref: 'teapot#43', status: 'draft', mergedAt: null },
  ]);
});

test('it leaves out attachments that are not GitHub, have no usable status, or name no PR', () => {
  const prs = parseStartedPrs([
    { url: 'https://example.com/x', sourceType: 'slack', metadata: { status: 'merged' } },
    github({ number: 44, repoName: 'kettle' }),
    github({ status: 'weird', number: 45, repoName: 'kettle' }),
    github(null),
    github({ status: 'closed' }, 'https://example.com/none'),
    'not an attachment',
  ]);

  expect(prs).toStrictEqual([]);
});

test('it takes the ref from the URL when the metadata lacks the repo or number', () => {
  expect(parseStartedPrs([github({ status: 'closed' })])).toStrictEqual([{ ref: 'kettle#41', status: 'closed', mergedAt: null }]);
});
