import { expect, test } from 'bun:test';
import { isOwner, pickIssueTarget, pickThreadTarget } from './pick-reply-target.ts';
import { buildBotComment, buildOwnerComment } from '../../test/build-stub-pr-comments.ts';

function setupTest() {
  const finding = 'aaaaaaaaaaaaaaaa';
  const other = 'bbbbbbbbbbbbbbbb';
  return { finding, other };
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
  const ctx = setupTest();
  const opener = buildBotComment(10, 'The kettle never boils.', [ctx.finding]);

  expect(pickThreadTarget([buildBotComment(9, 'The kettle never boils.', [ctx.other]), opener], ctx.finding)).toStrictEqual({ kind: 'thread', opener });
});

test('#pickThreadTarget skips a bot comment that names the finding only in its text', () => {
  const ctx = setupTest();
  const misleading = { ...buildBotComment(10, 'The kettle never boils.', [ctx.other]), body: `Unlike ${ctx.finding}, the spout leaks.\n\n<!-- noslop:finding {"id":"${ctx.other}"} -->` };

  expect(pickThreadTarget([misleading], ctx.finding)).toBeNull();
});

test('#pickThreadTarget sees a valid accepted-risk reply as standing', () => {
  const ctx = setupTest();
  const standing = buildOwnerComment(11, 10, `${ctx.finding} accepted-risk The lid is cosmetic.`);

  expect(pickThreadTarget([buildBotComment(10, 'The kettle never boils.', [ctx.finding]), standing], ctx.finding)).toStrictEqual({ kind: 'standing', url: standing.url });
});

test('#pickThreadTarget posts again when the earlier accepted-risk reply has no reason', () => {
  const ctx = setupTest();
  const opener = buildBotComment(10, 'The kettle never boils.', [ctx.finding]);

  expect(pickThreadTarget([opener, buildOwnerComment(11, 10, `${ctx.finding} accepted-risk`)], ctx.finding)).toStrictEqual({ kind: 'thread', opener });
});

test("#pickThreadTarget posts again when the owner's latest answer is no longer accepted-risk", () => {
  const ctx = setupTest();
  const opener = buildBotComment(10, 'The kettle never boils.', [ctx.finding]);
  const comments = [opener, buildOwnerComment(11, 10, 'accepted-risk The lid is cosmetic.'), buildOwnerComment(12, 10, 'not-a-defect the lid ships separately')];

  expect(pickThreadTarget(comments, ctx.finding)).toStrictEqual({ kind: 'thread', opener });
});

test('#pickThreadTarget ignores an accepted-risk reply by another login', () => {
  const ctx = setupTest();
  const opener = buildBotComment(10, 'The kettle never boils.', [ctx.finding]);
  const stranger = { ...buildOwnerComment(11, 10, 'accepted-risk The lid is cosmetic.'), login: 'kettle-fan' };

  expect(pickThreadTarget([opener, stranger], ctx.finding)).toStrictEqual({ kind: 'thread', opener });
});

test('#pickIssueTarget reads only the id-led line that names the finding', () => {
  const ctx = setupTest();
  const comments = [buildBotComment(20, 'The kettle never boils.', [ctx.finding, ctx.other]), buildOwnerComment(21, null, `${ctx.other} accepted-risk The spout is cosmetic.`)];

  expect(pickIssueTarget(comments, ctx.finding)).toStrictEqual({ kind: 'issue' });
});

test('#pickIssueTarget sees a standing id-led acceptance', () => {
  const ctx = setupTest();
  const standing = buildOwnerComment(21, null, `${ctx.finding} accepted-risk The lid is cosmetic.`);

  expect(pickIssueTarget([buildBotComment(20, 'The kettle never boils.', [ctx.finding]), standing], ctx.finding)).toStrictEqual({ kind: 'standing', url: standing.url });
});

test('#pickIssueTarget gives missing when no noslop comment holds the finding', () => {
  const ctx = setupTest();
  expect(pickIssueTarget([buildBotComment(20, 'The kettle never boils.', [ctx.other])], ctx.finding)).toStrictEqual({ kind: 'missing' });
});
