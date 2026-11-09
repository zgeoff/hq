import { expect, onTestFinished, test } from 'bun:test';
import { NOON_SYDNEY, at, freshDb } from '../../test/helpers.ts';
import { seedAskAnswerEventWithNumber } from './seed-ask-answer-event-with-number.ts';

function setupTest() {
  const fresh = freshDb();
  at(NOON_SYDNEY);
  onTestFinished(fresh.cleanup);
  return { db: fresh.db, readEvents: () => fresh.db.query('SELECT subject, subject_id, action, actor, at, data FROM events').all() };
}

test('#seedAskAnswerEventWithNumber stores one answered ask event whose answer is a number', () => {
  const ctx = setupTest();

  seedAskAnswerEventWithNumber(ctx);

  expect(ctx.readEvents()).toStrictEqual([{ subject: 'ask', subject_id: 'kettle', action: 'answered', actor: 'kettle-bot', at: '2026-10-14T01:00:00Z', data: '{"answer":42}' }]);
});

test('#seedAskAnswerEventWithNumber applies input overrides', () => {
  const ctx = setupTest();

  seedAskAnswerEventWithNumber(ctx, { subject_id: 'kettle-descale', actor: 'console' });

  expect(ctx.readEvents()).toMatchObject([{ subject_id: 'kettle-descale', actor: 'console', data: '{"answer":42}' }]);
});
