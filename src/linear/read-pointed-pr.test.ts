import { expect, test } from 'bun:test';
import { isOwnFixPR, readPointedPR } from './read-pointed-pr.ts';
import type { PRLink } from './read-pointed-pr.ts';

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
])('#readPointedPR reads %s', (_case, description, attachments, expected) => {
  expect(readPointedPR({ id: 'GEO-9700', description, createdAt: '2026-10-20T11:54:00Z', attachments }, () => Promise.resolve(null))).resolves.toBe(expected);
});

test.each([
  ['a Fixes line for the issue', 'Fixes GEO-9700', true],
  ['a Contributes to line for the issue', 'Descale the kettle.\n\nContributes to GEO-9700', true],
  ['a Related to line for the issue', 'Related to GEO-9700', true],
  ['a bulleted line for the issue', '- Fixes GEO-9700', true],
  ['an indented line for the issue', '  Related to GEO-9700', true],
  ['a line for another issue', 'Fixes GEO-9701', false],
  ['a line for an issue whose id starts with this one', 'Fixes GEO-97001', false],
  ['the id only in prose', 'The kettle work from GEO-9700 needs a retry.', false],
  ['a Fixes line with a colon', 'Fixes: GEO-9700', true],
  ['a link in the middle of a line', 'Descales the kettle and contributes to GEO-9700 along the way.', true],
  ['a lowercase id', 'fixes geo-9700', true],
  ['an empty body', '', false],
])('#isOwnFixPR reads %s as %p', (_case, body, expected) => {
  expect(isOwnFixPR(body, 'GEO-9700')).toBe(expected);
});

test('#readPointedPR skips an attachment whose PR names the issue as its own fix, and counts one whose body does not', async () => {
  const bodies: Record<string, string> = { 'widgets#7': 'Contributes to GEO-9700', 'widgets#8': 'Fixes GEO-9600' };
  const readBody = (link: PRLink) => Promise.resolve(bodies[`${link.repo}#${link.number}`] ?? null);
  const own = { url: 'https://github.com/zgeoff/widgets/pull/7', openedAt: '2026-10-20T09:00:00Z' };
  const source = { url: 'https://github.com/zgeoff/widgets/pull/8', openedAt: '2026-10-20T09:00:00Z' };

  const pointed = {
    own: await readPointedPR({ id: 'GEO-9700', description: '', createdAt: '2026-10-20T11:54:00Z', attachments: [own] }, readBody),
    both: await readPointedPR({ id: 'GEO-9700', description: '', createdAt: '2026-10-20T11:54:00Z', attachments: [own, source] }, readBody),
  };

  expect(pointed).toStrictEqual({ own: null, both: 'widgets#8' });
});

test('#readPointedPR reads the description of no attachment after the first one that counts as the source', async () => {
  const read: PRLink[] = [];
  const source = { url: 'https://github.com/zgeoff/widgets/pull/8', openedAt: '2026-10-20T09:00:00Z' };
  const later = { url: 'https://github.com/zgeoff/widgets/pull/9', openedAt: '2026-10-20T10:00:00Z' };

  await readPointedPR({ id: 'GEO-9700', description: '', createdAt: '2026-10-20T11:54:00Z', attachments: [source, later] }, (link) => {
    read.push(link);
    return Promise.resolve('Fixes GEO-9600');
  });

  expect(read).toStrictEqual([{ owner: 'zgeoff', repo: 'widgets', number: '8' }]);
});

test('#readPointedPR counts an earlier attachment from another owner as the source without reading its PR', async () => {
  const read: PRLink[] = [];
  const attachment = { url: 'https://github.com/acme/widgets/pull/7', openedAt: '2026-10-20T09:00:00Z' };

  const pointed = await readPointedPR({ id: 'GEO-9700', description: '', createdAt: '2026-10-20T11:54:00Z', attachments: [attachment] }, (link) => {
    read.push(link);
    return Promise.resolve('Fixes GEO-9700');
  });

  expect({ pointed, read }).toStrictEqual({ pointed: 'widgets#7', read: [] });
});
