import { expect, onTestFinished, test } from 'bun:test';
import { NOON_SYDNEY, at, freshDb } from '../../test/helpers.ts';
import { readOutboxRows } from '../outbox/read-outbox-rows.ts';
import { REVIEWER } from '../runs/reviewer.ts';
import { findPRStatus } from './find-pr-status.ts';
import { recordPRAnswer } from './record-pr-answer.ts';

function setupTest() {
  const fresh = freshDb();
  at(NOON_SYDNEY);
  onTestFinished(fresh.cleanup);
  return {
    db: fresh.db,
    readQueued: () => readOutboxRows(fresh.db).map((row) => ({ target: row.target, text: row.text })),
    readStatus: (repo: string, pr: number) => findPRStatus(fresh.db, repo, pr),
  };
}

test('it queues one message to the reviewer and sets next on lgtm', async () => {
  const ctx = setupTest();

  recordPRAnswer(ctx.db, { repo: 'widgets', pr: 7, answer: 'lgtm', head: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678', source: 'chat:kettle-1', note: null, actor: 'z-kettle' });

  expect(ctx.readQueued()).toStrictEqual([{ target: REVIEWER, text: "The owner's lgtm on widgets#7 is recorded at a1b2c3d. Run `hq review gate widgets 7`, and merge if it passes." }]);
  const status = await ctx.readStatus('widgets', 7);
  expect(status?.next).toBe(REVIEWER);
});

test('it queues a message to the reviewer and sets next on an lgtm whose head could not be read', async () => {
  const ctx = setupTest();

  recordPRAnswer(ctx.db, { repo: 'widgets', pr: 7, answer: 'lgtm', head: null, source: 'chat:kettle-1', note: null, actor: 'z-kettle' });

  expect(ctx.readQueued()).toStrictEqual([{ target: REVIEWER, text: "The owner's lgtm on widgets#7 is recorded; its head could not be read. Run `hq review gate widgets 7`, and merge if it passes." }]);
  const status = await ctx.readStatus('widgets', 7);
  expect(status?.next).toBe(REVIEWER);
});

test.each(['changes', 'reject'] as const)('it queues nothing and leaves next unset for a %s answer', async (answer) => {
  const ctx = setupTest();

  recordPRAnswer(ctx.db, { repo: 'widgets', pr: 7, answer, head: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678', source: 'chat:kettle-1', note: 'rename it', actor: 'z-kettle' });

  expect(ctx.readQueued()).toStrictEqual([]);
  const status = await ctx.readStatus('widgets', 7);
  expect(status?.next).toBeNull();
});

test('it queues nothing and leaves next unset when the reviewer records the lgtm', async () => {
  const ctx = setupTest();

  recordPRAnswer(ctx.db, { repo: 'widgets', pr: 7, answer: 'lgtm', head: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678', source: 'chat:kettle-1', note: null, actor: REVIEWER });

  expect(ctx.readQueued()).toStrictEqual([]);
  const status = await ctx.readStatus('widgets', 7);
  expect(status?.next).toBeNull();
});

test('it stores the answer and its pr-answer event together', async () => {
  const ctx = setupTest();

  recordPRAnswer(ctx.db, { repo: 'widgets', pr: 7, answer: 'lgtm', head: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678', source: 'chat:kettle-1', note: null, actor: 'z-kettle' });

  const status = await ctx.readStatus('widgets', 7);
  expect(status).toMatchObject({ answer: 'lgtm', answer_head: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678' });
  expect(ctx.db.query("SELECT subject_id FROM events WHERE action = 'pr-answer'").all()).toStrictEqual([{ subject_id: 'pr:widgets#7' }]);
});

test('it stores no answer when its pr-answer event cannot be written', async () => {
  const ctx = setupTest();
  ctx.db.run("CREATE TEMP TRIGGER refuse_pr_answer BEFORE INSERT ON events WHEN NEW.action = 'pr-answer' BEGIN SELECT RAISE(ABORT, 'invented: events refused'); END");

  expect(() => recordPRAnswer(ctx.db, { repo: 'widgets', pr: 7, answer: 'lgtm', head: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678', source: 'chat:kettle-1', note: null, actor: 'z-kettle' })).toThrow('invented: events refused');
  const status = await ctx.readStatus('widgets', 7);
  expect(status).toBeNull();
});
