import { expect, onTestFinished, test } from 'bun:test';
import { NOON_SYDNEY, at, freshDb } from '../../test/helpers.ts';
import { logEvent } from '../log-event.ts';
import { findOwnerLgtm } from './find-owner-lgtm.ts';
import { recordPRAnswer } from './record-pr-answer.ts';
import type { PRAnswer } from './types.ts';

function setupTest() {
  const fresh = freshDb();
  const head = 'b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2';
  const reviewed = 'a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1';
  at(NOON_SYDNEY);
  onTestFinished(fresh.cleanup);
  return {
    db: fresh.db,
    head,
    older: 'e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1',
    reviewed,
    answer: async (answer: PRAnswer, answeredHead: string, source = 'chat:kettle-1') => await recordPRAnswer(fresh.db, { repo: 'widgets', pr: 7, answer, head: answeredHead, source, note: answer === 'changes' ? 'Descale it first.' : null, actor: 'z-kettle' }),
    find: () => findOwnerLgtm(fresh.db, 'widgets', 7, { reviewed, head }),
  };
}

test('it finds a changes at the reviewed head followed by an lgtm at the head', async () => {
  const ctx = setupTest();
  await ctx.answer('changes', ctx.reviewed);
  await ctx.answer('lgtm', ctx.head, 'console:kettle-2');

  expect(ctx.find()).toMatchObject({ changes: { answer: 'changes', head: ctx.reviewed, source: 'chat:kettle-1' }, lgtm: { answer: 'lgtm', head: ctx.head, source: 'console:kettle-2' } });
});

test('it finds the pair when an lgtm at an older head came before the changes', async () => {
  const ctx = setupTest();
  await ctx.answer('lgtm', ctx.older);
  await ctx.answer('changes', ctx.reviewed);
  await ctx.answer('lgtm', ctx.head, 'call:kettle-3');

  expect(ctx.find()).toMatchObject({ changes: { head: ctx.reviewed }, lgtm: { head: ctx.head } });
});

test('it finds nothing without a changes at the reviewed head', async () => {
  const ctx = setupTest();
  await ctx.answer('changes', ctx.older);
  await ctx.answer('lgtm', ctx.head);

  expect(ctx.find()).toBeNull();
});

test('it finds nothing when the last answer at the reviewed head is not changes', async () => {
  const ctx = setupTest();
  await ctx.answer('changes', ctx.reviewed);
  await ctx.answer('lgtm', ctx.reviewed);
  await ctx.answer('lgtm', ctx.head);

  expect(ctx.find()).toBeNull();
});

test('it finds nothing when the lgtm is at an older head', async () => {
  const ctx = setupTest();
  await ctx.answer('changes', ctx.reviewed);
  await ctx.answer('lgtm', ctx.older);

  expect(ctx.find()).toBeNull();
});

test('it finds nothing when a later answer follows the lgtm', async () => {
  const ctx = setupTest();
  await ctx.answer('changes', ctx.reviewed);
  await ctx.answer('lgtm', ctx.head);
  await ctx.answer('reject', ctx.head);

  expect(ctx.find()).toBeNull();
});

test('it finds nothing when the head is the reviewed head', async () => {
  const ctx = setupTest();
  await ctx.answer('changes', ctx.reviewed);

  expect(findOwnerLgtm(ctx.db, 'widgets', 7, { reviewed: ctx.reviewed, head: ctx.reviewed })).toBeNull();
});

test.each([
  ['the changes', 'changes'],
  ['the lgtm', 'lgtm'],
])('it finds nothing when %s names no answer source', async (_label, which) => {
  const ctx = setupTest();
  if (which === 'changes') {
    logEvent(ctx.db, 'hq', 'pr:widgets#7', 'pr-answer', 'z-kettle', null, null, { answer: 'changes', head: ctx.reviewed, source: 'session:z-kettle', note: 'Descale it first.' });
    await ctx.answer('lgtm', ctx.head);
  } else {
    await ctx.answer('changes', ctx.reviewed);
    logEvent(ctx.db, 'hq', 'pr:widgets#7', 'pr-answer', 'z-kettle', null, null, { answer: 'lgtm', head: ctx.head, source: 'session:z-kettle', note: null });
  }

  expect(ctx.find()).toBeNull();
});

test('it finds nothing when an answer event does not parse', async () => {
  const ctx = setupTest();
  await ctx.answer('changes', ctx.reviewed);
  await ctx.answer('lgtm', ctx.head);
  logEvent(ctx.db, 'hq', 'pr:widgets#7', 'pr-answer', 'z-kettle', null, null, { answer: 'maybe', head: ctx.head, source: 'chat:kettle-1' });

  expect(ctx.find()).toBeNull();
});

test('it reads only the answers of its own PR', async () => {
  const ctx = setupTest();
  await ctx.answer('changes', ctx.reviewed);
  await recordPRAnswer(ctx.db, { repo: 'widgets', pr: 8, answer: 'lgtm', head: ctx.head, source: 'chat:kettle-1', note: null, actor: 'z-kettle' });

  expect(ctx.find()).toBeNull();
});

test('it finds a changes followed by an lgtm carried to the head by hq pr rebased', async () => {
  const ctx = setupTest();
  await ctx.answer('changes', ctx.reviewed);
  await ctx.answer('lgtm', ctx.head, `rebased:${ctx.older}`);

  expect(ctx.find()).toMatchObject({ lgtm: { answer: 'lgtm', head: ctx.head, source: `rebased:${ctx.older}` } });
});

test('it does not take a rebased: source as the owner answer to a changes', async () => {
  const ctx = setupTest();
  await ctx.answer('changes', ctx.reviewed, `rebased:${ctx.older}`);
  await ctx.answer('lgtm', ctx.head);

  expect(ctx.find()).toBeNull();
});
