import { expect, test } from 'bun:test';
import { findLinkedIssue } from './find-linked-issue.ts';

test.each([
  ['Fixes GEO-12: mend the kettle.', 'GEO-12'],
  ['Related to GEO-3\nContributes to GEO-7', 'GEO-7'],
  ['Related to GEO-3\nContributes to GEO-7\nfixes geo-9', 'GEO-9'],
  ['Related to: GEO-40', 'GEO-40'],
  ['See GEO-5 for the background.', null],
  ['Fixes #14', null],
  ['', null],
])('it finds the strongest linked issue in %j', (body, issue) => {
  expect(findLinkedIssue(body)).toBe(issue);
});
