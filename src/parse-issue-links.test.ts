import { expect, test } from 'bun:test';
import { parseIssueLinks } from './parse-issue-links.ts';
import type { IssueLink } from './parse-issue-links.ts';

test.each<[string, string, IssueLink[]]>([
  ['a Fixes line', 'Fixes GEO-12', [{ relation: 'Fixes', keyword: 'Fixes', id: 'GEO-12' }]],
  ['a Fixes line with a colon', 'Fixes: GEO-12', [{ relation: 'Fixes', keyword: 'Fixes', id: 'GEO-12' }]],
  ['a link in the middle of a line', 'Mends the kettle and fixes GEO-12 in passing.', [{ relation: 'Fixes', keyword: 'fixes', id: 'GEO-12' }]],
  ['a lowercase id, as written', 'Related to geo-3', [{ relation: 'Related to', keyword: 'Related to', id: 'geo-3' }]],
  ['another team prefix', 'Contributes to OPS-7', [{ relation: 'Contributes to', keyword: 'Contributes to', id: 'OPS-7' }]],
  [
    'several links, strongest relation first and text order within one',
    'Related to GEO-3\nContributes to GEO-7\nFixes GEO-9\nFixes GEO-10',
    [
      { relation: 'Fixes', keyword: 'Fixes', id: 'GEO-9' },
      { relation: 'Fixes', keyword: 'Fixes', id: 'GEO-10' },
      { relation: 'Contributes to', keyword: 'Contributes to', id: 'GEO-7' },
      { relation: 'Related to', keyword: 'Related to', id: 'GEO-3' },
    ],
  ],
  ['an id with no relation', 'See GEO-5 for the background.', []],
  ['a GitHub issue number', 'Fixes #14', []],
  ['an empty body', '', []],
])('it reads %s', (_case, body, links) => {
  expect(parseIssueLinks(body)).toStrictEqual(links);
});
