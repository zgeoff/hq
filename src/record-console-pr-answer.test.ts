import { expect, onTestFinished, spyOn, test } from 'bun:test';
import { FAKE_FULL_SHA, buildFakeRunner } from '../test/noslop-fake.ts';
import { createUnblockItems } from '../test/create-unblock-items.ts';
import { NOON_SYDNEY, at, freshDb } from '../test/helpers.ts';
import { recordConsolePRAnswer } from './record-console-pr-answer.ts';
import { recordConsoleReview } from './record-console-review.ts';
import { getUnblock } from './unblock/get-unblock.ts';

function setupTest() {
  const fresh = freshDb();
  at(NOON_SYDNEY);
  onTestFinished(fresh.cleanup);
  return { db: fresh.db };
}

test.each([
  ['lgtm', '', null],
  ['changes', ' Descale it first. ', 'Descale it first.'],
  ['reject', 'The spout is wrong.', 'The spout is wrong.'],
] as const)('it writes a console %s answer on a PR review to the PR record, at its head, sourced from the item', async (review, note, stored) => {
  const ctx = setupTest(),
    fake = buildFakeRunner(),
    item = recordConsoleReview(createUnblockItems(ctx.db, { 'review-4': { task: 'Review kettle#4 and say lgtm', links: [{ label: 'kettle#4', url: 'https://github.com/zgeoff/kettle/pull/4', subject: true }] } }), { id: 'review-4', review, note, actor: 'console' });

  await recordConsolePRAnswer(ctx.db, fake.run, item, { review, note, actor: 'console' });

  expect(ctx.db.query('SELECT repo, pr, head, answer, answer_head, answer_source, answer_note FROM pr_status').all()).toStrictEqual([
    { repo: 'kettle', pr: 4, head: FAKE_FULL_SHA, answer: review, answer_head: FAKE_FULL_SHA, answer_source: 'console:review-4', answer_note: stored },
  ]);
  expect(fake.lines()).toStrictEqual(['gh pr view 4 -R zgeoff/kettle --json headRefOid']);
});

test('it reads the head with a deadline', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner(),
    item = recordConsoleReview(createUnblockItems(ctx.db, { 'review-4': { task: 'Review kettle#4 and say lgtm', links: [{ label: 'kettle#4', url: 'https://github.com/zgeoff/kettle/pull/4', subject: true }] } }), { id: 'review-4', review: 'lgtm', note: '', actor: 'console' });

  await recordConsolePRAnswer(ctx.db, fake.run, item, { review: 'lgtm', note: '', actor: 'console' });

  expect(fake.calls.map((call) => call.opts)).toStrictEqual([{ timeoutMs: 60_000 }]);
});

test('it writes no record for a console Later answer, which is no answer', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner(),
    item = recordConsoleReview(createUnblockItems(ctx.db, { 'review-4': { task: 'Review kettle#4 and say lgtm', links: [{ label: 'kettle#4', url: 'https://github.com/zgeoff/kettle/pull/4', subject: true }] } }), { id: 'review-4', review: 'later', note: '', actor: 'console' });

  await recordConsolePRAnswer(ctx.db, fake.run, item, { review: 'later', note: '', actor: 'console' });

  expect(ctx.db.query('SELECT COUNT(*) AS n FROM pr_status').get()).toStrictEqual({ n: 0 });
  expect(fake.calls).toStrictEqual([]);
});

test('it writes no record for a PR of an owner other than zgeoff, and leaves the console answer standing', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner(),
    item = recordConsoleReview(createUnblockItems(ctx.db, { 'review-4': { task: 'Review kettle#4 and say lgtm', links: [{ label: 'kettle#4', url: 'https://github.com/kettle-co/kettle/pull/4', subject: true }] } }), { id: 'review-4', review: 'lgtm', note: '', actor: 'console' });

  await expect(recordConsolePRAnswer(ctx.db, fake.run, item, { review: 'lgtm', note: '', actor: 'console' })).resolves.toBe(false);

  expect(ctx.db.query('SELECT COUNT(*) AS n FROM pr_status').get()).toStrictEqual({ n: 0 });
  expect(fake.calls).toStrictEqual([]);
  expect(getUnblock(ctx.db, 'review-4')?.state).toBe('done');
});

test('it stores the answer with no head when gh cannot give the head', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner({ prHead: { code: 1, stdout: '', stderr: 'gh: not found' } }),
    item = recordConsoleReview(createUnblockItems(ctx.db, { 'review-4': { task: 'Review kettle#4 and say lgtm', links: [{ label: 'kettle#4', url: 'https://github.com/zgeoff/kettle/pull/4', subject: true }] } }), { id: 'review-4', review: 'lgtm', note: '', actor: 'console' });

  await recordConsolePRAnswer(ctx.db, fake.run, item, { review: 'lgtm', note: '', actor: 'console' });

  expect(ctx.db.query('SELECT head, answer, answer_head, answer_source FROM pr_status').all()).toStrictEqual([{ head: null, answer: 'lgtm', answer_head: null, answer_source: 'console:review-4' }]);
  expect(getUnblock(ctx.db, 'review-4')?.state).toBe('done');
});

test('it leaves the console answer standing when the record cannot be written', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner(),
    item = recordConsoleReview(createUnblockItems(ctx.db, { 'review-4': { task: 'Review kettle#4 and say lgtm', links: [{ label: 'kettle#4', url: 'https://github.com/zgeoff/kettle/pull/4', subject: true }] } }), { id: 'review-4', review: 'lgtm', note: '', actor: 'console' }),
    logger = spyOn(console, 'log').mockImplementation(() => {});
  onTestFinished(() => logger.mockRestore());
  ctx.db.exec('DROP TABLE pr_status');

  await expect(recordConsolePRAnswer(ctx.db, fake.run, item, { review: 'lgtm', note: '', actor: 'console' })).resolves.toBe(false);

  expect(getUnblock(ctx.db, 'review-4')?.state).toBe('done');
});

test('it logs a record it cannot write', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner(),
    item = recordConsoleReview(createUnblockItems(ctx.db, { 'review-4': { task: 'Review kettle#4 and say lgtm', links: [{ label: 'kettle#4', url: 'https://github.com/zgeoff/kettle/pull/4', subject: true }] } }), { id: 'review-4', review: 'lgtm', note: '', actor: 'console' }),
    logger = spyOn(console, 'log').mockImplementation(() => {});
  onTestFinished(() => logger.mockRestore());
  ctx.db.exec('DROP TABLE pr_status');

  await recordConsolePRAnswer(ctx.db, fake.run, item, { review: 'lgtm', note: '', actor: 'console' });

  expect(logger.mock.calls).toStrictEqual([['2026-10-14T01:00:00Z console: the lgtm on review-4 was not written to the PR record of kettle#4: no such table: pr_status']]);
});
