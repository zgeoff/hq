import { expect, test } from 'bun:test';
import { findPointedPR } from './find-pointed-pr.ts';

test.each([
  ['a GitHub PR attachment', '', ['https://github.com/zgeoff/widgets/pull/7'], 'widgets#7'],
  ['a PR link in the description', 'Seen on https://github.com/zgeoff/kettle/pull/12#discussion_r1.', [], 'kettle#12'],
  ['a first line From <repo>#<n>', 'From widgets#7\n\nThe widget drops a retry.', [], 'widgets#7'],
  ['a Found by line, with the issue as a Linear mention', 'Found by the <issue id="x" href="https://linear.app/x/issue/GEO-9700/y">GEO-9700</issue> agent on widgets#41 (head abc1234)', [], 'widgets#41'],
  ['an attachment that is not a PR', 'Descale the kettle.', ['https://github.com/zgeoff/widgets/issues/7'], null],
  ['From in the middle of a line', 'Taken From widgets#7 by hand.', [], null],
])('it reads the PR from %s', (_case, description, attachmentURLs, expected) => {
  expect(findPointedPR(description, attachmentURLs)).toBe(expected);
});
