import { expect, onTestFinished, test } from 'bun:test';
import { NOON_SYDNEY, at, freshDb } from '../../test/helpers.ts';
import { recordPRAnswer } from './record-pr-answer.ts';

function setupTest() {
  const fresh = freshDb();
  at(NOON_SYDNEY);
  onTestFinished(fresh.cleanup);
  return { db: fresh.db };
}

test('it stores the answer and its pr-answer event together', () => {
  const ctx = setupTest();

  recordPRAnswer(ctx.db, { repo: 'widgets', pr: 7, answer: 'lgtm', head: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678', source: 'chat:kettle-1', note: null, actor: 'z-kettle' });

  expect(ctx.db.query('SELECT answer, answer_head FROM pr_status').all()).toStrictEqual([{ answer: 'lgtm', answer_head: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678' }]);
  expect(ctx.db.query("SELECT subject_id FROM events WHERE action = 'pr-answer'").all()).toStrictEqual([{ subject_id: 'pr:widgets#7' }]);
});

test('it stores no answer when its pr-answer event cannot be written', () => {
  const ctx = setupTest();
  ctx.db.run("CREATE TEMP TRIGGER refuse_pr_answer BEFORE INSERT ON events WHEN NEW.action = 'pr-answer' BEGIN SELECT RAISE(ABORT, 'invented: events refused'); END");

  expect(() => recordPRAnswer(ctx.db, { repo: 'widgets', pr: 7, answer: 'lgtm', head: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678', source: 'chat:kettle-1', note: null, actor: 'z-kettle' })).toThrow('invented: events refused');
  expect(ctx.db.query('SELECT answer FROM pr_status').all()).toStrictEqual([]);
});
