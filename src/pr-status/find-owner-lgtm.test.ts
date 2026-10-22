import { expect, onTestFinished, test } from 'bun:test';
import { NOON_SYDNEY, at, freshDb } from '../../test/helpers.ts';
import { logEvent } from '../log-event.ts';
import { findOwnerLgtm } from './find-owner-lgtm.ts';
import { recordPRAnswer } from './record-pr-answer.ts';
import type { PRAnswer } from './types.ts';

const HEAD = 'b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2',
  OLDER = 'e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1',
  REVIEWED = 'a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1';

function setupTest() {
  const fresh = freshDb();
  at(NOON_SYDNEY);
  onTestFinished(fresh.cleanup);
  return {
    db: fresh.db,
    answer: async (answer: PRAnswer, head: string, source = 'chat:kettle-1') => await recordPRAnswer(fresh.db, { repo: 'widgets', pr: 7, answer, head, source, note: answer === 'changes' ? 'Descale it first.' : null, actor: 'z-kettle' }),
    find: () => findOwnerLgtm(fresh.db, 'widgets', 7, { reviewed: REVIEWED, head: HEAD }),
  };
}

test('it finds a changes at the reviewed head followed by an lgtm at the head', async () => {
  const ctx = setupTest();
  await ctx.answer('changes', REVIEWED);
  await ctx.answer('lgtm', HEAD, 'console:kettle-2');

  expect(ctx.find()).toMatchObject({ changes: { answer: 'changes', head: REVIEWED, source: 'chat:kettle-1' }, lgtm: { answer: 'lgtm', head: HEAD, source: 'console:kettle-2' } });
});

test('it finds the pair when an lgtm at an older head came before the changes', async () => {
  const ctx = setupTest();
  await ctx.answer('lgtm', OLDER);
  await ctx.answer('changes', REVIEWED);
  await ctx.answer('lgtm', HEAD, 'call:kettle-3');

  expect(ctx.find()).toMatchObject({ changes: { head: REVIEWED }, lgtm: { head: HEAD } });
});

test('it finds nothing without a changes at the reviewed head', async () => {
  const ctx = setupTest();
  await ctx.answer('changes', OLDER);
  await ctx.answer('lgtm', HEAD);

  expect(ctx.find()).toBeNull();
});

test('it finds nothing when the last answer at the reviewed head is not changes', async () => {
  const ctx = setupTest();
  await ctx.answer('changes', REVIEWED);
  await ctx.answer('lgtm', REVIEWED);
  await ctx.answer('lgtm', HEAD);

  expect(ctx.find()).toBeNull();
});

test('it finds nothing when the lgtm is at an older head', async () => {
  const ctx = setupTest();
  await ctx.answer('changes', REVIEWED);
  await ctx.answer('lgtm', OLDER);

  expect(ctx.find()).toBeNull();
});

test('it finds nothing when a later answer follows the lgtm', async () => {
  const ctx = setupTest();
  await ctx.answer('changes', REVIEWED);
  await ctx.answer('lgtm', HEAD);
  await ctx.answer('reject', HEAD);

  expect(ctx.find()).toBeNull();
});

test('it finds nothing when the head is the reviewed head', async () => {
  const ctx = setupTest();
  await ctx.answer('changes', REVIEWED);

  expect(findOwnerLgtm(ctx.db, 'widgets', 7, { reviewed: REVIEWED, head: REVIEWED })).toBeNull();
});

test.each([
  ['the changes', 'changes'],
  ['the lgtm', 'lgtm'],
])('it finds nothing when %s names no answer source', async (_label, which) => {
  const ctx = setupTest();
  if (which === 'changes') {
    logEvent(ctx.db, 'hq', 'pr:widgets#7', 'pr-answer', 'z-kettle', null, null, { answer: 'changes', head: REVIEWED, source: 'session:z-kettle', note: 'Descale it first.' });
    await ctx.answer('lgtm', HEAD);
  } else {
    await ctx.answer('changes', REVIEWED);
    logEvent(ctx.db, 'hq', 'pr:widgets#7', 'pr-answer', 'z-kettle', null, null, { answer: 'lgtm', head: HEAD, source: 'session:z-kettle', note: null });
  }

  expect(ctx.find()).toBeNull();
});

test('it finds nothing when an answer event does not parse', async () => {
  const ctx = setupTest();
  await ctx.answer('changes', REVIEWED);
  await ctx.answer('lgtm', HEAD);
  logEvent(ctx.db, 'hq', 'pr:widgets#7', 'pr-answer', 'z-kettle', null, null, { answer: 'maybe', head: HEAD, source: 'chat:kettle-1' });

  expect(ctx.find()).toBeNull();
});

test('it reads only the answers of its own PR', async () => {
  const ctx = setupTest();
  await ctx.answer('changes', REVIEWED);
  await recordPRAnswer(ctx.db, { repo: 'widgets', pr: 8, answer: 'lgtm', head: HEAD, source: 'chat:kettle-1', note: null, actor: 'z-kettle' });

  expect(ctx.find()).toBeNull();
});
