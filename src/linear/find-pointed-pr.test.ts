import { expect, test } from 'bun:test';
import { findPointedPR } from './find-pointed-pr.ts';

test.each([
  ['a GitHub PR attachment that opened before the issue', '', [{ url: 'https://github.com/zgeoff/widgets/pull/7', openedAt: '2026-10-20T09:00:00Z' }], 'widgets#7'],
  ['no PR: its only PR attachment opened after the issue', '', [{ url: 'https://github.com/zgeoff/widgets/pull/7', openedAt: '2026-10-20T21:27:00Z' }], null],
  ['no PR: its PR attachment has no open time', '', [{ url: 'https://github.com/zgeoff/widgets/pull/7', openedAt: null }], null],
  ['a PR link in the description', 'Seen on https://github.com/zgeoff/kettle/pull/12#discussion_r1.', [], 'kettle#12'],
  ['a first line From <repo>#<n>', 'From widgets#7\n\nThe widget drops a retry.', [], 'widgets#7'],
  ['a Found by line, with the issue as a Linear mention', 'Found by the <issue id="x" href="https://linear.app/x/issue/GEO-9700/y">GEO-9700</issue> agent on widgets#41 (head abc1234)', [], 'widgets#41'],
  ['a Found by line, even with a later PR attached', 'The kettle hums.\n\nFound by the GEO-9700 agent on widgets#41', [{ url: 'https://github.com/zgeoff/tools/pull/290', openedAt: '2026-10-21T09:00:00Z' }], 'widgets#41'],
  ['a Found by line after a list marker', '* Found by the GEO-9700 agent on widgets#41', [], 'widgets#41'],
  ['no PR: a Found by quote inside a sentence', '* GEO-9701 says "Found by the GEO-9700 agent on widgets#41", but the check named its delivery PR.', [], null],
  ['an attachment that is not a PR', 'Descale the kettle.', [{ url: 'https://github.com/zgeoff/widgets/issues/7', openedAt: '2026-10-20T09:00:00Z' }], null],
  ['no PR: From in the middle of a line', 'Taken From widgets#7 by hand.', [], null],
])('it reads %s', (_case, description, attachments, expected) => {
  expect(findPointedPR(description, attachments, '2026-10-20T11:54:00Z')).toBe(expected);
});
