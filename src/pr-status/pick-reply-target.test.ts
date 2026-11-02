import { expect, test } from 'bun:test';
import { isOwner, pickIssueTarget, pickThreadTarget } from './pick-reply-target.ts';
import type { PRComment } from './read-pr-comments.ts';

const FINDING = 'aaaaaaaaaaaaaaaa';
const OTHER = 'bbbbbbbbbbbbbbbb';

function buildBot(id: number, findings: string[]): PRComment {
  return { id, replyTo: null, login: 'noslop-review[bot]', type: 'Bot', body: ['The kettle never boils.', ...findings.map((finding) => `<!-- noslop:finding {"id":"${finding}"} -->`)].join('\n\n'), url: `https://example.invalid/c${id}` };
}

function buildOwner(id: number, replyTo: number | null, body: string): PRComment {
  return { id, replyTo, login: 'zgeoff', type: 'User', body, url: `https://example.invalid/c${id}` };
}

test.each([
  { login: 'zgeoff', owner: true },
  { login: 'ZGeoff', owner: true },
  { login: 'zgeoff[bot]', owner: false },
  { login: 'zgeoff-bot', owner: false },
  { login: 'xzgeoff', owner: false },
  { login: 'zgeof', owner: false },
  { login: '', owner: false },
  { login: null, owner: false },
])('#isOwner reads $login as owner: $owner', (row) => {
  expect(isOwner({ id: 1, replyTo: null, login: row.login, type: 'User', body: '', url: 'https://example.invalid/c1' })).toBe(row.owner);
});

test('#pickThreadTarget picks the thread whose marker names the finding', () => {
  const opener = buildBot(10, [FINDING]);

  expect(pickThreadTarget([buildBot(9, [OTHER]), opener], FINDING)).toStrictEqual({ kind: 'thread', opener });
});

test('#pickThreadTarget skips a bot comment that names the finding only in its text', () => {
  const misleading = { ...buildBot(10, [OTHER]), body: `Unlike ${FINDING}, the spout leaks.\n\n<!-- noslop:finding {"id":"${OTHER}"} -->` };

  expect(pickThreadTarget([misleading], FINDING)).toBeNull();
});

test('#pickThreadTarget sees a valid accepted-risk reply as standing', () => {
  const standing = buildOwner(11, 10, `${FINDING} accepted-risk The lid is cosmetic.`);

  expect(pickThreadTarget([buildBot(10, [FINDING]), standing], FINDING)).toStrictEqual({ kind: 'standing', url: standing.url });
});

test('#pickThreadTarget posts again when the earlier accepted-risk reply has no reason', () => {
  const opener = buildBot(10, [FINDING]);

  expect(pickThreadTarget([opener, buildOwner(11, 10, `${FINDING} accepted-risk`)], FINDING)).toStrictEqual({ kind: 'thread', opener });
});

test("#pickThreadTarget posts again when the owner's latest answer is no longer accepted-risk", () => {
  const opener = buildBot(10, [FINDING]);
  const comments = [opener, buildOwner(11, 10, 'accepted-risk The lid is cosmetic.'), buildOwner(12, 10, 'not-a-defect the lid ships separately')];

  expect(pickThreadTarget(comments, FINDING)).toStrictEqual({ kind: 'thread', opener });
});

test('#pickThreadTarget ignores an accepted-risk reply by another login', () => {
  const opener = buildBot(10, [FINDING]);
  const stranger = { ...buildOwner(11, 10, 'accepted-risk The lid is cosmetic.'), login: 'kettle-fan' };

  expect(pickThreadTarget([opener, stranger], FINDING)).toStrictEqual({ kind: 'thread', opener });
});

test('#pickIssueTarget reads only the id-led line that names the finding', () => {
  const comments = [buildBot(20, [FINDING, OTHER]), buildOwner(21, null, `${OTHER} accepted-risk The spout is cosmetic.`)];

  expect(pickIssueTarget(comments, FINDING)).toStrictEqual({ kind: 'issue' });
});

test('#pickIssueTarget sees a standing id-led acceptance', () => {
  const standing = buildOwner(21, null, `${FINDING} accepted-risk The lid is cosmetic.`);

  expect(pickIssueTarget([buildBot(20, [FINDING]), standing], FINDING)).toStrictEqual({ kind: 'standing', url: standing.url });
});

test('#pickIssueTarget gives missing when no noslop comment holds the finding', () => {
  expect(pickIssueTarget([buildBot(20, [OTHER])], FINDING)).toStrictEqual({ kind: 'missing' });
});
